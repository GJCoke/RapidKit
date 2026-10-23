"""Audit delivery retains immutable snapshots across claims, failures and replay.

Author : Codex
Date   : 2026-10-23
"""

import asyncio
import json
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_system.audit.crud import AuditLogCRUD
from plugin_system.audit.models import AuditLog, AuditLogTarget
from rapidkit_common.audit import AuditMetadata, AuditRecord, AuditTarget
from rapidkit_core.leader_election import LeaderElection
from rapidkit_core.log import logger
from rapidkit_core.redis_client import AsyncRedisClient
from redis.exceptions import ConnectionError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src import audit_queue
from src.audit_queue import RedisAuditQueue

pytestmark = pytest.mark.asyncio


def record():
    return AuditRecord(
        action="department.batch-delete",
        actor_id=uuid4(),
        result="success",
        duration_ms=123.5,
        metadata=AuditMetadata(reason="queue verification"),
        occurred_at=datetime(2026, 10, 23, 1, 2, 3, 123456),
        targets=[
            AuditTarget(resource_type="department", resource_id="first", resource_name="First", result="success"),
            AuditTarget(resource_type="department", resource_id="second", resource_name="Second", result="success"),
        ],
    )


@pytest_asyncio.fixture
async def delivery(monkeypatch, tmp_path):
    prefix = f"test:audit:{uuid4()}"
    keys = {
        "PENDING_KEY": prefix + ":pending",
        "PROCESSING_KEY": prefix + ":processing",
        "LEADER_KEY": prefix + ":leader",
    }
    for name, value in keys.items():
        monkeypatch.setattr(audit_queue, name, value)

    def election(client, key):
        return LeaderElection(client, key, ttl=1, renew_interval=0.03)

    monkeypatch.setattr(audit_queue, "LeaderElection", election)
    redis = AsyncRedisClient.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.ping()
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'audit.db'}", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(AuditLog.__table__.create)
        await connection.run_sync(AuditLogTarget.__table__.create)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def persist(batch):
        async with sessions() as session:
            await AuditLogCRUD(session).append_batch(batch)
            await session.commit()

    queues = []

    def queue(handler=persist, **kwargs):
        item = RedisAuditQueue(redis, handler, batch_size=2, flush_interval=0.02, **kwargs)
        queues.append(item)
        return item

    async def counts():
        async with sessions() as session:
            return len((await session.exec(select(AuditLog))).all()), len(
                (await session.exec(select(AuditLogTarget))).all()
            )

    try:
        yield SimpleNamespace(
            redis=redis,
            queue=queue,
            persist=persist,
            counts=counts,
            sessions=sessions,
            pending=keys["PENDING_KEY"],
            processing=keys["PROCESSING_KEY"],
        )
    finally:
        for item in queues:
            await item.shutdown()
        await redis.delete(*keys.values())
        await redis.aclose()
        await engine.dispose()


async def eventually(predicate, timeout=3):
    async with asyncio.timeout(timeout):
        while not await predicate():
            await asyncio.sleep(0.01)


async def test_put_is_durable_before_return(delivery):
    env = delivery
    item = record()
    await env.queue().put(item)
    payloads = await env.redis.lrange(env.pending, 0, -1)
    assert len(payloads) == 1
    assert json.loads(payloads[0])["id"] == str(item.id)
    assert await env.redis.llen(env.processing) == 0
    assert await env.counts() == (0, 0)


async def test_targets_survive_serialization(delivery):
    env = delivery
    item = record()
    await env.queue().put(item)
    payload = (await env.redis.lrange(env.pending, 0, -1))[0]
    assert json.loads(payload)["targets"] == [
        {
            "resource_type": "department",
            "resource_id": "first",
            "resource_name": "First",
            "result": "success",
            "error_message": None,
        },
        {
            "resource_type": "department",
            "resource_id": "second",
            "resource_name": "Second",
            "result": "success",
            "error_message": None,
        },
    ]
    restored = AuditRecord.model_validate_json(payload)
    assert (restored.id, restored.actor_id, restored.occurred_at, restored.metadata, restored.targets) == (
        item.id,
        item.actor_id,
        item.occurred_at,
        item.metadata,
        item.targets,
    )
    assert restored.duration_ms == 123.5


async def test_two_consumers_persist_once(delivery):
    env = delivery
    first, second = env.queue(), env.queue()
    await first.start()
    await second.start()
    item = record()
    await asyncio.gather(first.put(item), second.put(item))

    async def empty():
        return (
            await env.redis.llen(env.pending) == 0
            and await env.redis.llen(env.processing) == 0
            and await env.counts() == (1, 2)
        )

    await eventually(empty)
    assert await env.counts() == (1, 2)


@pytest.mark.parametrize("committed", [False, True], ids=["claimed-before-commit", "commit-before-ack"])
async def test_recover_claimed_batch_after_crash(delivery, committed):
    env = delivery
    paused = asyncio.Event()

    async def crash_window(batch):
        if committed:
            await env.persist(batch)
        paused.set()
        await asyncio.Event().wait()

    primary = env.queue(crash_window)
    await primary.start()
    item = record()
    await primary.put(item)
    await asyncio.wait_for(paused.wait(), 3)
    assert await env.redis.llen(env.processing) == 1
    assert await env.counts() == ((1, 2) if committed else (0, 0))
    await primary.shutdown()
    assert await env.redis.llen(env.processing) == 1
    standby = env.queue()
    await standby.start()

    async def complete():
        return await env.counts() == (1, 2) and await env.redis.llen(env.processing) == 0

    await eventually(complete)
    async with env.sessions() as session:
        stored = (await session.exec(select(AuditLog))).one()
        assert stored.id == item.id and stored.duration_ms == 123.5


async def test_database_failure_keeps_pending_for_retry(delivery):
    env = delivery
    attempts = 0
    failing = True

    async def persist(batch):
        nonlocal attempts
        attempts += 1
        if failing:
            raise RuntimeError("database offline")
        await env.persist(batch)

    queue = env.queue(persist)
    await queue.start()
    item = record()
    await queue.put(item)

    async def retried():
        return attempts >= 5

    await eventually(retried)
    assert await env.redis.llen(env.processing) == 1
    assert await env.counts() == (0, 0)
    failing = False

    async def recovered():
        return await env.counts() == (1, 2) and await env.redis.llen(env.processing) == 0

    await eventually(recovered)


async def test_redis_outage_warns_and_retries_memory_fallback(delivery, monkeypatch):
    env = delivery
    original = env.redis.rpush
    unavailable = True

    async def push(*args, **kwargs):
        if unavailable:
            raise ConnectionError("Redis offline")
        return await original(*args, **kwargs)

    monkeypatch.setattr(env.redis, "rpush", push)
    warnings = []
    sink = logger.add(lambda message: warnings.append(message.record), level="WARNING")
    events = []
    queue = env.queue(on_state=lambda event, count: events.append((event, count)))
    item = record()
    try:
        await queue.put(item)
        item.duration_ms = 999  # Retry must retain the original, already-captured snapshot.
        for _ in range(5):
            await queue.flush()
        assert await env.redis.llen(env.pending) == 0
        assert any(entry["level"].name == "WARNING" and "memory" in entry["message"].lower() for entry in warnings)
        assert ("queued", 1) in events
        unavailable = False
        await queue.start()

        async def restored():
            return await env.counts() == (1, 2)

        await eventually(restored)
        async with env.sessions() as session:
            stored = (await session.exec(select(AuditLog))).one()
            assert stored.id == item.id and stored.duration_ms == 123.5
    finally:
        logger.remove(sink)


async def test_cancelled_enqueue_retains_snapshot_and_preserves_cancellation(delivery, monkeypatch):
    env = delivery
    entered = asyncio.Event()
    original = env.redis.rpush

    async def paused(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(env.redis, "rpush", paused)
    queue = env.queue()
    producer = asyncio.create_task(queue.put(record()))
    await asyncio.wait_for(entered.wait(), 3)
    producer.cancel()
    with pytest.raises(asyncio.CancelledError):
        await producer
    monkeypatch.setattr(env.redis, "rpush", original)
    await queue.start()

    async def recovered():
        return await env.counts() == (1, 2)

    await eventually(recovered)
