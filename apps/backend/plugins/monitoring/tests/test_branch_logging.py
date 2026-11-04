import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest
from tests.testing.utils import one_event


@asynccontextmanager
async def session_scope(session):
    yield session


async def test_aggregation_summary(monkeypatch, json_log):
    from plugin_monitoring import aggregator

    prefix = "metrics:api_hour:20261104_10:GET:"
    keys = [
        "private-invalid",
        prefix + "/private-empty",
        prefix + "/private-same",
        prefix + "/private-vanished",
        prefix + "/private-valid",
    ]
    baseline = json.dumps(dict(count=0, errors=0, total_ms=0, p95_ms=0))
    data = {
        keys[1]: {},
        keys[2]: {"count": "2", "archived_count": "2"},
        keys[3]: {"count": "1"},
        keys[4]: {"count": "1", "baseline": baseline},
    }

    async def scan(**_):
        for key in keys:
            yield key

    redis = NS(
        scan_iter=scan,
        hgetall=AsyncMock(side_effect=lambda key: data[key]),
        eval=AsyncMock(return_value=[]),
        set=AsyncMock(),
        delete=AsyncMock(),
    )
    crud = NS(get_hourly=AsyncMock(return_value=None), upsert_hourly=AsyncMock())
    monkeypatch.setattr(aggregator, "ApiMetricsCRUD", lambda _: crud)
    monkeypatch.setattr(aggregator, "_compute_p95", AsyncMock(return_value=0))
    await aggregator.aggregate_once(redis, lambda: session_scope(NS(commit=AsyncMock())))
    row = one_event(json_log(), "monitoring.aggregation.completed")
    assert (row["level"], row["processed_count"], row["filtered_count"]) == ("DEBUG", 1, 4)
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("name", ["aggregate_api_metrics", "cleanup_old_api_metrics"])
async def test_lock_held(name, monkeypatch, json_log):
    from plugin_monitoring import tasks

    monkeypatch.setattr(tasks, "DistributedLock", lambda *_args, **_kwargs: NS(acquire=AsyncMock(return_value=False)))
    await getattr(tasks, name).run(None, None)
    row = one_event(json_log(), "monitoring.task.skipped")
    assert (row["level"], row["outcome"], row["reason_code"], row["task_name"], row["plugin"]) == (
        "DEBUG",
        "skipped",
        "lock_held",
        name,
        "Monitoring",
    )
    assert "private-" not in str(json_log())


async def test_leader_baseline_reset(monkeypatch, json_log):
    from plugin_monitoring import push

    monkeypatch.setattr(push.RedisManager, "client", lambda: None)
    monkeypatch.setattr(push, "get_realtime_stats", AsyncMock(return_value={"totalRequests": 7, "totalErrors": 1}))
    monkeypatch.setattr(push.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError))
    with pytest.raises(asyncio.CancelledError):
        await push.push_api_stats_loop(AsyncMock(), NS(is_leader=True))
    row = one_event(json_log(), "monitoring.push.fallback")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("INFO", "fallback", "leader_baseline_reset")
    assert "private-" not in str(json_log())
