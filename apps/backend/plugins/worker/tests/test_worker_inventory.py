"""Current worker inventory verified against real async SQLite."""

from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from plugin_worker.crud import WorkerCRUD
from plugin_worker.event_service import EventService
from plugin_worker.models import CeleryWorker, QueueDepthSnapshot
from plugin_worker.operations import WorkerOperationsProviderImpl
from plugin_worker.tasks import capture_queue_depth
from rapidkit_common.enums import WorkerStatus
from rapidkit_core.config import settings
from rapidkit_core.timezone import timezone
from rapidkit_framework.events import event_bus
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

STABLE = "celery@rapidkit-prod-celery-worker"
LEGACY = "celery@9e0db842abba"


@pytest_asyncio.fixture
async def inventory(monkeypatch):
    monkeypatch.setattr(settings, "CELERY_WORKER_NAMES", [STABLE])
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        for model in (CeleryWorker, QueueDepthSnapshot):
            await conn.run_sync(model.__table__.create)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add(CeleryWorker(hostname=LEGACY, status=WorkerStatus.OFFLINE, active_queues=["legacy"]))
        await session.commit()
    yield factory
    await engine.dispose()


async def add_current(factory, status=WorkerStatus.ONLINE, stale=False):
    async with factory() as session:
        worker = CeleryWorker(
            hostname=STABLE,
            status=status,
            active_queues=["priority"],
            last_heartbeat=timezone.now() - timedelta(seconds=120 if stale else 0),
        )
        session.add(worker)
        await session.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,stale,healthy",
    [(WorkerStatus.ONLINE, False, 1), (WorkerStatus.OFFLINE, False, 0), (WorkerStatus.ONLINE, True, 0)],
)
async def test_managed_list_and_health(inventory, status, stale, healthy):
    await add_current(inventory, status, stale)
    async with inventory() as session:
        crud = WorkerCRUD(session)
        assert [worker.hostname for worker in await crud.get_all_workers()] == [STABLE]
        assert await crud.get_by_hostname(LEGACY) is not None
    snapshot = await WorkerOperationsProviderImpl(inventory).get_server_snapshot(timezone.now())
    assert (snapshot.healthy, snapshot.total) == (healthy, 1)


@pytest.mark.asyncio
async def test_missing_expected_worker_is_unhealthy(inventory):
    snapshot = await WorkerOperationsProviderImpl(inventory).get_server_snapshot(timezone.now())
    assert (snapshot.healthy, snapshot.total) == (0, 1)
    async with inventory() as session:
        assert await WorkerCRUD(session).get_all_workers() == []


@pytest.mark.asyncio
async def test_discovery_preserves_offline_workers(inventory, monkeypatch):
    monkeypatch.setattr(settings, "CELERY_WORKER_NAMES", [])
    await add_current(inventory)
    async with inventory() as session:
        assert {worker.hostname for worker in await WorkerCRUD(session).get_all_workers()} == {STABLE, LEGACY}
    snapshot = await WorkerOperationsProviderImpl(inventory).get_server_snapshot(timezone.now())
    assert (snapshot.healthy, snapshot.total) == (1, 2)


@pytest.mark.asyncio
async def test_queue_discovery_and_sampling_exclude_legacy(inventory):
    await add_current(inventory)
    redis = MagicMock()
    redis.llen = AsyncMock(side_effect=lambda queue: {"celery": 2, "priority": 3, "legacy": 100}[queue])
    provider = WorkerOperationsProviderImpl(inventory, lambda: redis)
    snapshot = await provider.get_queue_snapshot(timezone.now())
    assert snapshot.current_depth == 5
    assert {call.args[0] for call in redis.llen.await_args_list} == {"celery", "priority"}
    redis.llen.reset_mock()
    await capture_queue_depth(redis, inventory)
    assert {call.args[0] for call in redis.llen.await_args_list} == {"celery", "priority"}
    async with inventory() as session:
        sample = (await session.exec(select(QueueDepthSnapshot))).one()
        assert sample.depth == 5
        assert len((await session.exec(select(CeleryWorker))).all()) == 2


@pytest.mark.asyncio
async def test_stable_worker_restarts_upsert_same_row(inventory):
    ids = []
    for count in (1, 2):
        async with inventory() as session:
            worker = await WorkerCRUD(session).upsert_by_hostname(STABLE, {"processed_count": count})
            await session.commit()
            ids.append(worker.id)
    assert ids[0] == ids[1]
    async with inventory() as session:
        workers = await WorkerCRUD(session).get_all_workers()
        assert len(workers) == 1
        assert workers[0].processed_count == 2


@pytest.mark.asyncio
async def test_multiple_expected_workers_include_missing_members(inventory, monkeypatch):
    monkeypatch.setattr(settings, "CELERY_WORKER_NAMES", [STABLE, "celery@second-worker"])
    await add_current(inventory)
    snapshot = await WorkerOperationsProviderImpl(inventory).get_server_snapshot(timezone.now())
    assert (snapshot.healthy, snapshot.total) == (1, 2)


@pytest.mark.asyncio
async def test_offline_sweep_ignores_legacy_online_worker(inventory):
    await add_current(inventory, stale=True)
    async with inventory() as session:
        crud = WorkerCRUD(session)
        legacy = await crud.get_by_hostname(LEGACY)
        legacy.status = WorkerStatus.ONLINE
        legacy.last_heartbeat = timezone.now() - timedelta(seconds=120)
        await session.flush()
        assert [worker.hostname for worker in await crud.get_offline_workers(60)] == [STABLE]


@pytest.mark.asyncio
@pytest.mark.parametrize("hostname,managed", [(LEGACY, False), (STABLE, True)])
async def test_worker_status_emission_uses_inventory(inventory, hostname, managed):
    async with inventory() as session:
        sio = MagicMock()
        sio.emit = AsyncMock()
        service = EventService(session, sio)
        await service._emit_worker_status(CeleryWorker(hostname=hostname))
        assert sio.emit.await_count == (2 if managed else 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("hostname,managed", [(LEGACY, False), (STABLE, True)])
async def test_offline_event_preserves_history_without_legacy_alert(inventory, monkeypatch, hostname, managed):
    await add_current(inventory)
    fire = MagicMock()
    monkeypatch.setattr(event_bus, "fire_and_forget", fire)
    async with inventory() as session:
        sio = MagicMock()
        sio.emit = AsyncMock()
        service = EventService(session, sio)
        await service.handle_worker_offline({"hostname": hostname})
        worker = await service.worker_crud.get_by_hostname(hostname)
        assert worker.status == WorkerStatus.OFFLINE
        assert fire.call_count == int(managed)
        assert sio.emit.await_count == (2 if managed else 0)
