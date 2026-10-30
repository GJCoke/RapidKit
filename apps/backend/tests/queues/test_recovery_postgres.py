import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from plugin_system.audit.models import AuditLog
from plugin_system.audit.writer import AuditWriterImpl
from plugin_worker import event_service
from plugin_worker.models import CeleryTaskResult
from rapidkit_core.config import settings
from rapidkit_core.transaction import run_after_commit_hooks
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.queues import consumer, event_stream


@pytest.mark.parametrize("window", ["audit_failure", "timeout", "committed_before_ack"])
async def test_database_and_audit_recover_as_one_transaction(session, pg_engine, redis, monkeypatch, window):
    monkeypatch.setattr(settings, "AUDIT_ENABLED", True)
    monkeypatch.setattr(event_service, "get_service_optional", lambda _: AuditWriterImpl())
    monkeypatch.setattr(event_service.event_bus, "async_emit", AsyncMock())
    sessions = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    await consumer._ensure_consumer_group(redis)
    fields = {
        "event_type": "task.success",
        "timestamp": "2026-10-30T02:16:59+00:00",
        "data": json.dumps({"task_id": "crash-window", "task_name": "demo", "request_id": "request-crash"}),
    }
    message_id = await redis.xadd(consumer.STREAM_KEY, fields)
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "crashing", {consumer.STREAM_KEY: ">"})
    audit = event_service.EventService._audit_execution
    ack = redis.xack
    if window == "committed_before_ack":

        async def fail_ack(*args):
            raise ConnectionError("connection lost after commit")

        monkeypatch.setattr(redis, "xack", fail_ack)
        expected_error = ConnectionError
    else:

        async def fail_audit(self, *args):
            await audit(self, *args)
            if window == "timeout":
                await asyncio.Event().wait()
            raise RuntimeError("database interrupted")

        monkeypatch.setattr(event_service.EventService, "_audit_execution", fail_audit)
        monkeypatch.setattr(event_stream, "PROCESS_TIMEOUT_SECONDS", 2 if window == "timeout" else 20)
        expected_error = TimeoutError if window == "timeout" else RuntimeError
    sio = SimpleNamespace(emit=AsyncMock())
    with pytest.raises(expected_error):
        await event_stream.process_message(redis, message_id, fields, sio, session_factory=sessions)
    assert (await redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP))["pending"] == 1
    async with sessions() as tx:
        tasks = (await tx.exec(select(CeleryTaskResult))).all()
        audits = (await tx.exec(select(AuditLog))).all()
        assert len(tasks) == len(audits) == (1 if window == "committed_before_ack" else 0)
    if window != "committed_before_ack":
        assert not sio.emit.called
    monkeypatch.setattr(redis, "xack", ack)
    monkeypatch.setattr(event_service.EventService, "_audit_execution", audit)
    monkeypatch.setattr(event_stream, "PROCESS_TIMEOUT_SECONDS", 20)
    await event_stream.process_message(redis, message_id, fields, sio, session_factory=sessions)
    assert (await redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP))["pending"] == 0
    async with sessions() as tx:
        task = (await tx.exec(select(CeleryTaskResult))).one()
        records = (await tx.exec(select(AuditLog))).all()
        assert len(records) == 1 and records[0].request_id == task.request_id == "request-crash"


async def test_notifications_wait_for_database_commit(session, monkeypatch):
    monkeypatch.setattr(settings, "AUDIT_ENABLED", False)
    sio = SimpleNamespace(emit=AsyncMock())
    service = event_service.EventService(session, sio)
    await service.handle_task_started({"task_id": "notify", "task_name": "demo"})
    assert not sio.emit.called
    await session.commit()
    await run_after_commit_hooks(session)
    assert sio.emit.called


async def test_permanent_pending_does_not_starve_new_task_events(session, pg_engine, redis, monkeypatch):
    monkeypatch.setattr(settings, "AUDIT_ENABLED", False)
    sessions = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    await consumer._ensure_consumer_group(redis)
    old = await redis.xadd(consumer.STREAM_KEY, {"event_type": "task.success", "data": '{"task_id":"blocked"}'})
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "dead", {consumer.STREAM_KEY: ">"})
    await redis.xadd(consumer.STREAM_KEY, {"event_type": "task.started", "data": '{"task_id":"fresh"}'})
    claim = redis.xautoclaim

    async def always_eligible(*args, **kwargs):
        await redis.xclaim(consumer.STREAM_KEY, consumer.CONSUMER_GROUP, "dead", 0, [old], idle=120_000)
        return await claim(*args, **kwargs)

    async def persist_failure(*args):
        raise RuntimeError("permanent database failure for this task")

    monkeypatch.setattr(redis, "xautoclaim", always_eligible)
    monkeypatch.setattr(consumer, "AsyncSessionLocal", sessions)
    monkeypatch.setattr(consumer.RedisManager, "client", lambda: redis)
    monkeypatch.setattr(consumer.EventService, "_audit_execution", persist_failure)
    monkeypatch.setattr(consumer, "BLOCK_MS", 5)
    runner = asyncio.create_task(consumer.consume_events(SimpleNamespace(emit=AsyncMock())))
    try:
        async with asyncio.timeout(2):
            while True:
                async with sessions() as tx:
                    fresh = await event_service.TaskResultCRUD(tx).get_by_task_id("fresh")
                    if fresh:
                        break
                await asyncio.sleep(0.01)
    finally:
        runner.cancel()
        await runner
    assert (await redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP))["pending"] == 1
