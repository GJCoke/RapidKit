"""Worker pools retain deployment intent separately from process liveness."""

from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from plugin_worker.api import _control_worker, get_worker_history, retire_worker_endpoint
from plugin_worker.crud import WorkerCRUD
from plugin_worker.event_service import EventService
from plugin_worker.inventory import abort_deployment, finish_deployment, group_summaries, prepare_deployment
from plugin_worker.models import CeleryWorker, WorkerGroup
from plugin_worker.schemas import WorkerHistoryQuery
from rapidkit_common.enums import WorkerStatus
from rapidkit_core.config import settings
from rapidkit_core.timezone import timezone
from rapidkit_core.transaction import run_after_commit_hooks
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture
async def pools(monkeypatch):
    monkeypatch.setattr(settings, "CELERY_WORKER_NAMES", [])
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        for model in (WorkerGroup, CeleryWorker):
            await connection.run_sync(model.__table__.create)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    await engine.dispose()


def service(session):
    sio = MagicMock()
    sio.emit = AsyncMock()
    return EventService(session, sio)


async def online(events, name, group="prod/default", deployment="v1"):
    await events.handle_worker_online({"hostname": name, "group_name": group, "deployment_id": deployment})


@pytest.mark.asyncio
async def test_redeployment_retires_old_instances_without_losing_history(pools):
    async with pools() as session:
        events = service(session)
        await online(events, "celery@old")
        await prepare_deployment(session, "prod/default", 2, "v2")
        old = await events.worker_crud.get_by_hostname("celery@old")
        assert old.lifecycle == "draining"
        await online(events, "celery@new-1", deployment="v2")
        await online(events, "celery@new-2", deployment="v2")
        await finish_deployment(session, "prod/default", "v2")
        assert old.lifecycle == "retired"
        assert old.retired_at is not None
        assert {w.hostname for w in await WorkerCRUD(session).get_all_workers()} == {"celery@new-1", "celery@new-2"}
        await events.handle_worker_heartbeat({"hostname": "celery@old"})
        await online(events, "celery@old")
        assert old.lifecycle == "retired"
        assert len((await session.exec(select(CeleryWorker))).all()) == 3
        groups = await group_summaries(session, timezone.now())
        assert [(g.name, g.online, g.expected_replicas, g.missing) for g in groups] == [("prod/default", 2, 2, 0)]


@pytest.mark.asyncio
async def test_crashed_instance_is_not_automatically_retired(pools):
    async with pools() as session:
        events = service(session)
        await online(events, "celery@crash")
        worker = await events.worker_crud.get_by_hostname("celery@crash")
        worker.last_heartbeat = timezone.now() - timedelta(minutes=10)
        await events.check_offline_workers(timedelta(seconds=60))
        assert worker.status == WorkerStatus.OFFLINE
        assert worker.lifecycle == "active"
        assert [w.hostname for w in await WorkerCRUD(session).get_all_workers()] == ["celery@crash"]


@pytest.mark.asyncio
async def test_group_excess_cannot_mask_another_group_deficit(pools):
    async with pools() as session:
        events = service(session)
        await prepare_deployment(session, "prod/default", 1, "v1")
        await prepare_deployment(session, "prod/report", 1, "v1")
        await online(events, "celery@a")
        await online(events, "celery@b")
        groups = {g.name: g for g in await group_summaries(session, timezone.now())}
        assert groups["prod/default"].missing == 0
        assert groups["prod/report"].missing == 1
        assert groups["prod/report"].online == 0


@pytest.mark.asyncio
async def test_discovery_has_no_invented_expected_capacity(pools):
    async with pools() as session:
        await online(service(session), "celery@observed")
        group = (await group_summaries(session, timezone.now()))[0]
        assert group.expected_replicas is None
        assert group.missing == 0
        assert group.online == 1


@pytest.mark.asyncio
async def test_scale_to_zero_and_reject_overlapping_deployments(pools):
    async with pools() as session:
        await online(service(session), "celery@old")
        await prepare_deployment(session, "prod/default", 0, "v2")
        with pytest.raises(ValueError, match="progress"):
            await prepare_deployment(session, "prod/default", 3, "v3")
        await finish_deployment(session, "prod/default", "v2")
        group = (await group_summaries(session, timezone.now()))[0]
        assert (group.online, group.expected_replicas, group.missing) == (0, 0, 0)


@pytest.mark.asyncio
async def test_failed_deployment_restores_intent_but_not_dead_workers(pools):
    async with pools() as session:
        events = service(session)
        await prepare_deployment(session, "prod/default", 1, "v1")
        await online(events, "celery@old")
        await finish_deployment(session, "prod/default", "v1")
        await prepare_deployment(session, "prod/default", 3, "v2")
        await events.handle_worker_offline({"hostname": "celery@old"})
        await abort_deployment(session, "prod/default", "v2")
        worker = await events.worker_crud.get_by_hostname("celery@old")
        assert worker.status == WorkerStatus.OFFLINE
        assert worker.lifecycle == "active"
        summary = (await group_summaries(session, timezone.now()))[0]
        assert (summary.online, summary.expected_replicas, summary.missing) == (0, 1, 1)


@pytest.mark.asyncio
async def test_capacity_grace_and_recovery_are_emitted_once(pools, monkeypatch):
    fired = AsyncMock()
    monkeypatch.setattr(event_bus, "async_emit", fired)
    async with pools() as session:
        events = service(session)
        group = await prepare_deployment(session, "prod/default", 1, "v1")
        await events.check_worker_capacity()
        assert fired.call_count == 0
        group.missing_since = timezone.now() - timedelta(minutes=5)
        await events.check_worker_capacity()
        await events.check_worker_capacity()
        await run_after_commit_hooks(session)
        assert fired.call_count == 1
        assert fired.call_args.args[0].missing == 1
        await online(events, "celery@restored")
        await events.check_worker_capacity()
        await run_after_commit_hooks(session)
        assert fired.call_count == 2
        assert fired.call_args.args[0].missing == 0
        await events.check_worker_capacity()
        assert fired.call_count == 2


@pytest.mark.asyncio
async def test_retirement_and_history_are_explicit_and_control_is_blocked(pools):
    async with pools() as session:
        events = service(session)
        await online(events, "celery@manual")
        worker = await events.worker_crud.get_by_hostname("celery@manual")
        crud = WorkerCRUD(session)
        with pytest.raises(AppException):
            await retire_worker_endpoint(worker.id, crud)
        worker.last_heartbeat = timezone.now() - timedelta(minutes=5)
        await retire_worker_endpoint(worker.id, crud)
        assert await crud.get_all_workers() == []
        history = await get_worker_history(WorkerHistoryQuery(page=1, page_size=1), crud)
        assert history.data.total == 1
        assert history.data.records[0].hostname == "celery@manual"
        with pytest.raises(AppException):
            await _control_worker(worker.id, crud)
