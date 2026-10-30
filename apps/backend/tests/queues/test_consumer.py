import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from plugin_worker.models import CeleryTaskResult
from rapidkit_common.enums import TaskStatus
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from src.queues import consumer


@pytest_asyncio.fixture
async def event_consumer(monkeypatch, redis, tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'events.db'}",
        connect_args={"autocommit": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(CeleryTaskResult.__table__.create)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(consumer, "AsyncSessionLocal", sessions)
    monkeypatch.setattr(consumer.RedisManager, "client", lambda: redis)
    monkeypatch.setattr(consumer, "BLOCK_MS", 5)
    monkeypatch.setattr(consumer.EventService, "_audit_execution", AsyncMock())
    monkeypatch.setattr("plugin_worker.event_service.event_bus.fire_and_forget", lambda _: None)
    data = {"task_id": "interrupted-task", "task_name": "test.task", "attempt": 0}
    async with sessions() as session:
        session.add(
            CeleryTaskResult(
                task_id=data["task_id"],
                task_name=data["task_name"],
                status=TaskStatus.STARTED,
            )
        )
        await session.commit()
    await consumer._ensure_consumer_group(redis)
    message_id = await redis.xadd(consumer.STREAM_KEY, {"event_type": "task.success", "data": json.dumps(data)})
    try:
        yield SimpleNamespace(redis=redis, sessions=sessions, message_id=message_id)
    finally:
        await engine.dispose()


@asynccontextmanager
async def running_consumer():
    task = asyncio.create_task(consumer.consume_events(SimpleNamespace(emit=AsyncMock())))
    try:
        yield
    finally:
        task.cancel()
        await task


async def wait_until_acknowledged(state, status=TaskStatus.SUCCESS, remaining=0):
    async with asyncio.timeout(2):
        while True:
            async with state.sessions() as session:
                task = await consumer.EventService(session, None).task_crud.get_by_task_id("interrupted-task")
                pending = await state.redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP)
                if task.status == status and pending["pending"] == remaining:
                    return task
            await asyncio.sleep(0.01)


async def test_recovers_completion_abandoned_by_previous_process(event_consumer):
    state = event_consumer
    await state.redis.xreadgroup(consumer.CONSUMER_GROUP, "stopped-process", {consumer.STREAM_KEY: ">"})
    await state.redis.xclaim(
        consumer.STREAM_KEY,
        consumer.CONSUMER_GROUP,
        "stopped-process",
        0,
        [state.message_id],
        idle=120_000,
    )

    async with running_consumer():
        task = await wait_until_acknowledged(state)

    assert task.status == TaskStatus.SUCCESS
    assert task.finished_at is not None


@pytest.mark.parametrize("interruption", ["failure", "shutdown"])
async def test_uncommitted_completion_is_pending_and_retried_after_rollback(event_consumer, monkeypatch, interruption):
    state = event_consumer
    failed = asyncio.Event()

    async def fail_audit(*args):
        failed.set()
        if interruption == "shutdown":
            await asyncio.Event().wait()
        raise RuntimeError("transient database error")

    monkeypatch.setattr(consumer.EventService, "_audit_execution", fail_audit)
    async with running_consumer():
        async with asyncio.timeout(2):
            await failed.wait()
        await asyncio.sleep(0.03)

    async with state.sessions() as session:
        task = await consumer.EventService(session, None).task_crud.get_by_task_id("interrupted-task")
        assert task.status == TaskStatus.STARTED
        assert task.finished_at is None
    pending = await state.redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP)
    assert pending["pending"] == 1

    monkeypatch.setattr(consumer.EventService, "_audit_execution", AsyncMock())
    await state.redis.xclaim(
        consumer.STREAM_KEY,
        consumer.CONSUMER_GROUP,
        consumer.CONSUMER_NAME,
        0,
        [state.message_id],
        idle=120_000,
    )
    async with running_consumer():
        await wait_until_acknowledged(state)


async def test_keeps_fresh_pending_event_with_current_owner(event_consumer):
    state = event_consumer
    await state.redis.xreadgroup(consumer.CONSUMER_GROUP, "busy-process", {consumer.STREAM_KEY: ">"})

    async with running_consumer():
        await asyncio.sleep(0.03)

    pending = await state.redis.xpending_range(consumer.STREAM_KEY, consumer.CONSUMER_GROUP, "-", "+", 1)
    assert pending[0]["consumer"] == "busy-process"
    async with state.sessions() as session:
        task = await consumer.EventService(session, None).task_crud.get_by_task_id("interrupted-task")
        assert task.status == TaskStatus.STARTED


async def test_pending_scan_advances_past_fresh_entries_and_cleans_trimmed_ids(
    event_consumer,
):
    state = event_consumer
    await state.redis.xdel(consumer.STREAM_KEY, state.message_id)
    for _ in range(105):
        await state.redis.xadd(consumer.STREAM_KEY, {"event_type": "unknown"})
    trimmed_id = await state.redis.xadd(consumer.STREAM_KEY, {"event_type": "unknown"})
    completion_id = await state.redis.xadd(
        consumer.STREAM_KEY,
        {
            "event_type": "task.success",
            "data": json.dumps({"task_id": "interrupted-task"}),
        },
    )
    await state.redis.xreadgroup(consumer.CONSUMER_GROUP, "busy-process", {consumer.STREAM_KEY: ">"})
    await state.redis.xdel(consumer.STREAM_KEY, trimmed_id)
    await state.redis.xclaim(
        consumer.STREAM_KEY,
        consumer.CONSUMER_GROUP,
        "stopped-process",
        0,
        [completion_id],
        idle=120_000,
    )

    async with running_consumer():
        task = await wait_until_acknowledged(state, remaining=105)

    assert task.status == TaskStatus.SUCCESS


@pytest.mark.parametrize(
    ("event_type", "status", "time_field"),
    [
        ("task.started", TaskStatus.STARTED, "started_at"),
        ("task.success", TaskStatus.SUCCESS, "finished_at"),
        ("task.failure", TaskStatus.FAILURE, "finished_at"),
        ("task.retry", TaskStatus.RETRY, "update_time"),
        ("task.revoked", TaskStatus.REVOKED, "finished_at"),
    ],
)
async def test_delayed_event_uses_producer_time(event_consumer, event_type, status, time_field):
    state = event_consumer
    async with state.sessions() as session:
        task = await consumer.EventService(session, None).task_crud.get_by_task_id("interrupted-task")
        task.status = TaskStatus.PENDING if event_type == "task.started" else TaskStatus.STARTED
        task.started_at = datetime(2026, 10, 30, 2, 16, 50)
        await session.commit()
    await state.redis.xdel(consumer.STREAM_KEY, state.message_id)
    await state.redis.xadd(
        consumer.STREAM_KEY,
        {
            "event_type": event_type,
            "timestamp": "2026-10-30T10:16:59+08:00",
            "data": json.dumps({"task_id": "interrupted-task", "task_name": "test.task", "attempt": 0}),
        },
    )

    async with running_consumer():
        task = await wait_until_acknowledged(state, status)

    assert getattr(task, time_field) == datetime(2026, 10, 30, 2, 16, 59)
    if event_type in {"task.success", "task.failure", "task.retry"}:
        assert task.runtime == 9


async def test_replayed_completion_does_not_give_legacy_start_a_negative_runtime(
    event_consumer,
):
    state = event_consumer
    async with state.sessions() as session:
        task = await consumer.EventService(session, None).task_crud.get_by_task_id("interrupted-task")
        task.started_at = datetime(2026, 10, 30, 2, 17, 1)
        await session.commit()
    await state.redis.xdel(consumer.STREAM_KEY, state.message_id)
    await state.redis.xadd(
        consumer.STREAM_KEY,
        {
            "event_type": "task.success",
            "timestamp": "2026-10-30T02:16:59",
            "data": json.dumps({"task_id": "interrupted-task", "task_name": "test.task", "attempt": 0}),
        },
    )
    async with running_consumer():
        task = await wait_until_acknowledged(state)

    assert task.finished_at == datetime(2026, 10, 30, 2, 16, 59)
    assert task.runtime is None
