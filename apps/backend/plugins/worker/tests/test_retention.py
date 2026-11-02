import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from plugin_worker.event_service import EventService
from plugin_worker.models import CeleryTaskResult, CeleryWorker
from rapidkit_common.enums import TaskStatus
from rapidkit_core.config import settings
from rapidkit_core.timezone import timezone
from sqlmodel import select


async def test_retention_preserves_full_legacy_task_identifier(session, redis):
    from plugin_worker.models import TaskReceipt
    from plugin_worker.retention import prune_results
    from src.queues.consumer import _ensure_consumer_group

    await _ensure_consumer_group(redis)
    task_id = "x" * 255  # The existing result table permits custom IDs of this length.
    session.add(
        CeleryTaskResult(
            task_id=task_id,
            task_name="demo",
            status=TaskStatus.SUCCESS,
            finished_at=timezone.now() - timedelta(days=40),
        )
    )
    await session.commit()
    assert await prune_results(session, redis, days=30, apply=True) == 1
    await session.commit()
    assert (await session.exec(select(TaskReceipt))).one().task_id == task_id


async def test_retention_and_late_completion_serialize_in_postgresql(session, pg_engine, redis, monkeypatch):
    from plugin_worker.crud import TaskResultCRUD
    from plugin_worker.models import TaskReceipt
    from plugin_worker.retention import prune_results
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession
    from src.queues.consumer import _ensure_consumer_group

    monkeypatch.setattr(settings, "AUDIT_ENABLED", False)
    await _ensure_consumer_group(redis)
    session.add(CeleryWorker(hostname="race-worker", processed_count=1))
    session.add(
        CeleryTaskResult(
            task_id="race",
            task_name="demo",
            status=TaskStatus.SUCCESS,
            finished_at=timezone.now() - timedelta(days=40),
            worker_hostname="race-worker",
        )
    )
    await session.commit()
    sessions = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    locked, release = asyncio.Event(), asyncio.Event()
    original = TaskResultCRUD.get_by_task_id

    async with sessions() as cleaning:

        async def hold_cleanup(crud, *args, **kwargs):
            result = await original(crud, *args, **kwargs)
            if crud.session is cleaning:
                locked.set()
                await release.wait()
            return result

        monkeypatch.setattr(TaskResultCRUD, "get_by_task_id", hold_cleanup)

        async def expire():
            assert await prune_results(cleaning, redis, days=30, apply=True) == 1
            await cleaning.commit()

        async def duplicate():
            async with sessions() as arriving:
                service = EventService(arriving, SimpleNamespace(emit=AsyncMock()))
                await service.handle_task_success({"task_id": "race", "task_name": "demo", "hostname": "race-worker"})
                await arriving.commit()

        cleanup_task = asyncio.create_task(expire())
        await asyncio.wait_for(locked.wait(), 3)
        event_task = asyncio.create_task(duplicate())
        try:
            async with asyncio.timeout(3):
                while True:
                    async with pg_engine.connect() as connection:
                        waiting = await connection.scalar(
                            text("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted")
                        )
                    if waiting:
                        break
                    await asyncio.sleep(0.01)
            assert not event_task.done()
        finally:
            release.set()
            await asyncio.gather(cleanup_task, event_task)
    assert (await session.exec(select(CeleryTaskResult))).first() is None
    assert (await session.exec(select(TaskReceipt))).one().task_id == "race"
    await session.refresh((await session.exec(select(CeleryWorker))).one())
    assert (await session.exec(select(CeleryWorker))).one().processed_count == 1


async def test_retention_receipt_blocks_late_duplicates_without_recreating_records(session, redis, monkeypatch):
    from plugin_system.audit.models import AuditLog
    from plugin_system.audit.writer import AuditWriterImpl
    from plugin_worker import event_service
    from plugin_worker.models import TaskReceipt
    from plugin_worker.retention import prune_results
    from src.queues.consumer import _ensure_consumer_group

    monkeypatch.setattr(settings, "AUDIT_ENABLED", True)
    monkeypatch.setattr(event_service, "get_service_optional", lambda _: AuditWriterImpl())
    await _ensure_consumer_group(redis)
    session.add(CeleryWorker(hostname="retained-worker", processed_count=1))
    session.add(
        CeleryTaskResult(
            task_id="old",
            task_name="demo",
            status=TaskStatus.SUCCESS,
            finished_at=timezone.now() - timedelta(days=40),
            worker_hostname="retained-worker",
        )
    )
    await session.commit()
    assert await prune_results(session, redis, days=30) == 1
    assert (await session.exec(select(CeleryTaskResult))).one()
    assert await prune_results(session, redis, days=30, apply=True) == 1
    await session.commit()
    assert (await session.exec(select(TaskReceipt))).one().attempt == 0
    service = EventService(session, SimpleNamespace(emit=AsyncMock()))
    data = {"task_id": "old", "task_name": "demo", "hostname": "retained-worker", "attempt": 0}
    await service.handle_task_started(data)
    await service.handle_task_success(data)
    await session.commit()
    assert (await session.exec(select(CeleryTaskResult))).first() is None
    assert (await session.exec(select(CeleryWorker))).one().processed_count == 1
    assert (await session.exec(select(AuditLog).where(AuditLog.resource_id == "old"))).first() is None
    await service.handle_task_started({**data, "attempt": 1})
    await session.commit()
    assert (await session.exec(select(CeleryTaskResult))).one().retries == 1


async def test_retention_skips_references_and_pauses_on_unknown_queue_state(session, redis):
    from plugin_worker.retention import prune_results
    from src.queues.consumer import _ensure_consumer_group

    await _ensure_consumer_group(redis)
    for task_id in ("pending", "dead", "unread", "active"):
        session.add(
            CeleryTaskResult(
                task_id=task_id,
                task_name="demo",
                status=TaskStatus.STARTED if task_id == "active" else TaskStatus.SUCCESS,
                finished_at=timezone.now() - timedelta(days=40),
            )
        )
    await session.commit()
    await redis.xadd("celery:events", {"event_type": "task.success", "data": '{"task_id":"pending"}'})
    await redis.xreadgroup("fastapi-consumers", "stopped", {"celery:events": ">"})
    await redis.xadd("celery:events", {"event_type": "task.success", "data": '{"task_id":"unread"}'})
    await redis.xadd("celery:events:dead", {"event_type": "task.success", "data": '{"task_id":"dead"}'})
    assert await prune_results(session, redis, days=30, apply=True) == 0
    await redis.xgroup_create("celery:events", "unknown", id="0")
    with pytest.raises(ValueError):
        await prune_results(session, redis, days=30, apply=True)
    assert len((await session.exec(select(CeleryTaskResult))).all()) == 4
