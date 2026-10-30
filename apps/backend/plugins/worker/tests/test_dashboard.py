"""Dashboard broker metrics preserve unknown data and worker health."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import plugin_worker.dashboard as module
import pytest
from plugin_worker.dashboard import collect_queue_metrics, completion_rate, fill_history_buckets, get_queue_dashboard
from plugin_worker.models import CeleryWorker
from plugin_worker.schemas import WorkerGroupResponse
from plugin_worker.tasks import capture_queue_depth
from rapidkit_common.enums import WorkerStatus
from rapidkit_core.timezone import timezone
from rapidkit_core.timezone import TimeZone
from datetime import date
from sqlalchemy.dialects import postgresql


def test_success_rate_uses_completed_outcomes():
    assert completion_rate(9, 1) == 90
    assert completion_rate(0, 0) is None


@pytest.mark.asyncio
async def test_priority_depth_and_healthy_consumers():
    now = timezone.now()
    workers = [
        CeleryWorker(hostname="fresh", status=WorkerStatus.ONLINE, active_queues=["celery"], last_heartbeat=now),
        CeleryWorker(
            hostname="stale",
            status=WorkerStatus.ONLINE,
            active_queues=["other"],
            last_heartbeat=now - timedelta(seconds=61),
        ),
    ]
    broker = AsyncMock()
    broker.llen.side_effect = [2, 3, 0, 1, 5, 0, 0, 0]
    rows = await collect_queue_metrics(broker, ["celery", "other"], workers, now)
    assert [(row.name, row.depth, row.consumers) for row in rows] == [("celery", 6, 1), ("other", 5, 0)]
    assert broker.llen.await_args_list[1].args == ("celery\x06\x163",)


@pytest.mark.asyncio
async def test_broker_failure_is_unknown_not_zero():
    broker = AsyncMock()
    broker.llen.side_effect = ConnectionError("unreachable")
    rows = await collect_queue_metrics(broker, ["celery"], [], timezone.now())
    assert rows[0].depth is None
    assert rows[0].consumers == 0


@pytest.mark.asyncio
async def test_completion_window_and_p95_are_queried_by_finished_time(monkeypatch):

    now = timezone.now()

    def result(value):
        return MagicMock(one=MagicMock(return_value=value), all=MagicMock(return_value=value))

    session = MagicMock()
    session.exec = AsyncMock(
        side_effect=[result([]), result((9, 1, 2, 1.5, 4.2)), result(3), result(30), result([(now, 9, 1)]), result([])]
    )
    app = MagicMock()
    app.conf.task_default_queue = "celery"
    app.conf.task_routes = {"my.task": {"queue": "priority"}}
    app.conf.broker_url = "redis://localhost/1"
    app.conf.broker_transport_options = {}
    app.amqp.queues = {"celery": None}
    broker = AsyncMock()
    broker.llen.return_value = 0
    monkeypatch.setattr(module.Redis, "from_url", lambda *args, **kwargs: broker)
    monkeypatch.setattr(
        module,
        "group_summaries",
        AsyncMock(
            return_value=[
                WorkerGroupResponse(
                    name="prod/default",
                    expected_replicas=1,
                    online=1,
                    observed=1,
                    draining=0,
                    missing=0,
                    alerting=False,
                ),
                WorkerGroupResponse(
                    name="local/default",
                    expected_replicas=None,
                    online=0,
                    observed=1,
                    draining=0,
                    missing=0,
                    alerting=False,
                ),
            ]
        ),
    )
    response = await get_queue_dashboard(session, app, 7)
    assert (response.online_workers, response.total_workers, response.capacity_known) == (1, 1, True)
    assert response.success_rate == 90
    assert response.throughput == 2
    assert response.p95_runtime == 4.2
    assert {q.name for q in response.queues} == {"celery", "priority"}
    sql = str(session.exec.await_args_list[1].args[0].compile(dialect=postgresql.dialect()))
    assert "finished_at" in sql
    assert "percentile_cont" in sql
    assert "create_time" not in sql
    broker.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_daily_dashboard_groups_in_platform_zone_and_emits_dates(monkeypatch):
    monkeypatch.setattr(module, "timezone", TimeZone("Asia/Shanghai"))
    bucket_day = datetime(2026, 10, 29)

    def result(value):
        return MagicMock(one=lambda: value, all=lambda: value)

    session = MagicMock()
    session.exec = AsyncMock(
        side_effect=[
            result([]),
            result((2, 0, 0, 1.0, 1.0)),
            result(0),
            result(0),
            result([(bucket_day, 2, 0)]),
            result([(bucket_day, 4.0)]),
        ]
    )
    monkeypatch.setattr(module, "group_summaries", AsyncMock(return_value=[]))
    broker = AsyncMock()
    broker.llen.return_value = 0
    monkeypatch.setattr(module.Redis, "from_url", lambda *a, **kw: broker)
    app = MagicMock()
    app.conf.task_default_queue = "celery"
    app.conf.task_routes = {}
    app.conf.broker_url = "redis://localhost/1"
    app.conf.broker_transport_options = {}
    app.amqp.queues = {"celery": None}
    response = await get_queue_dashboard(session, app, 30)
    for call in session.exec.await_args_list[4:6]:
        sql = str(call.args[0].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert "timezone('Asia/Shanghai', timezone('UTC'," in sql
    payload = response.model_dump(mode="json", by_alias=True)
    point = next(p for p in payload["timeline"] if p["timeBucket"] == "2026-10-29")
    assert point["success"] == 2


@pytest.mark.asyncio
async def test_priority_sampling_does_not_persist_partial_depth():

    session = MagicMock()
    query_result = MagicMock()
    query_result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=query_result)
    session.commit = AsyncMock()
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    broker = AsyncMock()
    broker.llen.side_effect = ConnectionError()
    await capture_queue_depth(broker, factory, queue_names=["celery"], transport_options={})
    session.add.assert_not_called()
    session.commit.assert_not_awaited()


def test_missing_depth_buckets_remain_unknown():

    start = datetime(2026, 10, 9, 1)
    end = start + timedelta(hours=2)
    assert fill_history_buckets([(start, 4), (end, 2)], start, end, days=1, missing=(None,)) == [
        (start, 4),
        (start + timedelta(hours=1), None),
        (end, 2),
    ]
    assert fill_history_buckets([], start, end, days=1, missing=(0, 0)) == []


def test_daily_bucket_fill_uses_local_dates_across_dst(monkeypatch):
    monkeypatch.setattr(module, "timezone", TimeZone("Europe/Berlin"))
    start, end = datetime(2026, 3, 28, 23), datetime(2026, 3, 30, 22)
    rows = [(datetime(2026, 3, 29), 4), (datetime(2026, 3, 31), 2)]
    assert fill_history_buckets(rows, start, end, days=30, missing=(None,)) == [
        (date(2026, 3, 29), 4),
        (date(2026, 3, 30), None),
        (date(2026, 3, 31), 2),
    ]


@pytest.mark.asyncio
async def test_missing_subscription_data_does_not_claim_zero_consumers():
    now = timezone.now()
    worker = CeleryWorker(hostname="fresh", last_heartbeat=now, active_queues=[])
    broker = AsyncMock()
    broker.llen.return_value = 2
    rows = await collect_queue_metrics(broker, ["celery"], [worker], now, unknown_workers={"fresh"})
    assert rows[0].depth == 8
    assert rows[0].consumers is None


@pytest.mark.asyncio
async def test_subscription_inspection_enriches_missing_inventory_without_writing(monkeypatch):
    now = timezone.now()
    worker = CeleryWorker(hostname="fresh", last_heartbeat=now, active_queues=[])
    app = MagicMock()
    monkeypatch.setattr(module.asyncio, "to_thread", AsyncMock(return_value={"fresh": [{"name": "priority"}]}))
    enriched, unknown = await module.resolve_worker_subscriptions(app, [worker], now)
    assert enriched[0].active_queues == ["priority"]
    assert worker.active_queues == []
    assert unknown == set()
    app.control.inspect.assert_called_once_with(destination=["fresh"], timeout=1)
