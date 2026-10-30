import asyncio
import json
import os
import select
import signal
import socket
import subprocess
import sys
import threading
from unittest.mock import AsyncMock

import pytest
from redis import Redis as SyncRedis
from redis.exceptions import ResponseError
from src.queues import consumer, signals
from tests.testing.fixtures import pytest_settings


@pytest.mark.parametrize(
    "fields",
    [
        {"event_type": "task.success", "data": "private-invalid-json"},
        {"event_type": "task.success", "data": "[]"},
        {"event_type": "private-unknown", "data": '{"password":"private-token"}'},
        {"event_type": "task.success", "data": '{"task_id":"t","attempt":-1}'},
        {"event_type": "task.success", "data": '{"task_id":"t","attempt":null}'},
        {"event_type": "task.success", "timestamp": "private-invalid-time", "data": '{"task_id":"t"}'},
    ],
)
async def test_invalid_envelope_is_safely_isolated_before_ack(redis, fields):
    from src.queues.event_stream import DEAD_STREAM_KEY, process_message

    await consumer._ensure_consumer_group(redis)
    message_id = await redis.xadd(consumer.STREAM_KEY, fields)
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "test", {consumer.STREAM_KEY: ">"})
    await process_message(redis, message_id, fields, AsyncMock())
    assert (await redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP))["pending"] == 0
    dead = await redis.xrange(DEAD_STREAM_KEY)
    assert len(dead) == 1 and dead[0][1]["source_id"] == message_id
    assert "private-" not in json.dumps(dead)
    await process_message(redis, message_id, fields, AsyncMock())
    assert await redis.xlen(DEAD_STREAM_KEY) == 1


async def test_isolation_failure_keeps_source_pending(redis):
    from src.queues.event_stream import DEAD_STREAM_KEY, process_message

    await consumer._ensure_consumer_group(redis)
    fields = {"event_type": "task.success", "data": "broken"}
    message_id = await redis.xadd(consumer.STREAM_KEY, fields)
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "test", {consumer.STREAM_KEY: ">"})
    await redis.set(DEAD_STREAM_KEY, "wrong-type")
    with pytest.raises(ResponseError):
        await process_message(redis, message_id, fields, AsyncMock())
    assert (await redis.xpending(consumer.STREAM_KEY, consumer.CONSUMER_GROUP))["pending"] == 1


async def test_invalid_time_can_be_repaired_only_as_observation_replay(redis):
    from src.queues.event_stream import DEAD_STREAM_KEY, process_message, replay_dead_event

    await consumer._ensure_consumer_group(redis)
    fields = {"event_type": "task.success", "timestamp": "bad", "data": '{"task_id":"t","retval":"private-value"}'}
    message_id = await redis.xadd(consumer.STREAM_KEY, fields)
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "test", {consumer.STREAM_KEY: ">"})
    await process_message(redis, message_id, fields, AsyncMock())
    dead_id = (await redis.xrange(DEAD_STREAM_KEY))[0][0]
    with pytest.raises(ValueError):
        await replay_dead_event(redis, dead_id)
    replay_id = await replay_dead_event(redis, dead_id, timestamp="2026-10-30T01:00:00+00:00")
    replay = (await redis.xrange(consumer.STREAM_KEY, replay_id, replay_id))[0][1]
    assert replay["event_type"] == "task.success" and "private-" not in json.dumps(replay)
    assert replay["timestamp"] == "2026-10-30T01:00:00+00:00"
    assert await redis.xlen(DEAD_STREAM_KEY) == 1
    assert await redis.llen("celery") == 0


async def test_safe_trim_respects_pending_unread_retention_and_group_registry(redis):
    from src.queues.event_stream import safe_trim

    key = consumer.STREAM_KEY
    for number in range(1, 7):
        await redis.xadd(key, {"data": "{}"}, id=f"{number}-0")
    await consumer._ensure_consumer_group(redis)
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "test", {key: ">"}, count=3)
    await redis.xack(key, consumer.CONSUMER_GROUP, "1-0")
    result = await safe_trim(redis, cutoff_ms=10)
    assert result["removed"] == 1
    assert [row[0] for row in await redis.xrange(key)] == [f"{i}-0" for i in range(2, 7)]
    await redis.xack(key, consumer.CONSUMER_GROUP, "2-0", "3-0")
    assert (await safe_trim(redis, cutoff_ms=2))["removed"] == 0
    await redis.xgroup_create(key, "unregistered", id="0")
    assert (await safe_trim(redis, cutoff_ms=10))["reason"] == "group_mismatch"
    await redis.xgroup_destroy(key, "unregistered")
    await redis.xgroup_create(key, "second", id="0")
    assert (await safe_trim(redis, cutoff_ms=10, groups=(consumer.CONSUMER_GROUP, "second")))[
        "reason"
    ] == "group_uninitialized"
    await redis.xreadgroup("second", "test", {key: ">"}, count=1)
    assert (await safe_trim(redis, cutoff_ms=10, groups=(consumer.CONSUMER_GROUP, "second")))["removed"] == 0
    await redis.xack(key, "second", "2-0")
    assert (await safe_trim(redis, cutoff_ms=10, groups=(consumer.CONSUMER_GROUP, "second")))["removed"] == 0


async def test_trim_is_bounded_and_status_preserves_uninitialized_lag(redis):
    from src.queues.event_stream import safe_trim, stream_status

    for number in range(1, 1205):
        await redis.xadd(consumer.STREAM_KEY, {"data": "{}"}, id=f"{number}-0")
    await consumer._ensure_consumer_group(redis)
    before = await stream_status(redis)
    assert before["pending"] == 0 and before["lag"] == 1204 and before["dead"] == 0
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "test", {consumer.STREAM_KEY: ">"})
    ids = [row[0] for row in await redis.xrange(consumer.STREAM_KEY)]
    await redis.xack(consumer.STREAM_KEY, consumer.CONSUMER_GROUP, *ids)
    result = await safe_trim(redis, cutoff_ms=9999)
    assert result["removed"] == 1000
    assert await redis.xlen(consumer.STREAM_KEY) == 204


def test_publish_failure_is_independent_safe_and_does_not_raise(monkeypatch):
    class Disconnected:
        def xadd(self, *args, **kwargs):
            raise ConnectionError("private-redis-secret")

    monkeypatch.setattr(signals, "_get_redis", lambda: Disconnected())
    before = signals.publication_status()["failures"]
    assert signals._publish_event("task.success", {"task_id": "t", "request_id": "r"}) is False
    assert signals.publication_status()["failures"] == before + 1


def test_producer_never_applies_maxlen(monkeypatch):
    calls = []

    class RecordingRedis:
        def xadd(self, key, message, **options):
            calls.append(options)
            return "1-0"

    monkeypatch.setattr(signals, "_get_redis", lambda: RecordingRedis())
    signals._publish_event("task.success", {"task_id": "t"})
    assert calls == [{}]


def test_valid_unicode_identifiers_are_not_silently_changed_by_diagnostics():
    from rapidkit_core.diagnostics import task_diagnostics

    task_id = "汉" * 100
    hostname = "汉" * 200
    safe = task_diagnostics({"task_id": task_id, "request_id": task_id, "hostname": hostname})
    assert safe["task_id"] == safe["request_id"] == task_id
    assert safe["hostname"] == hostname


async def test_real_producer_preserves_pending_beyond_ten_thousand_and_ops_status(redis, monkeypatch):
    await consumer._ensure_consumer_group(redis)
    pending_id = await redis.xadd(consumer.STREAM_KEY, {"event_type": "task.success", "data": '{"task_id":"old"}'})
    await redis.xreadgroup(consumer.CONSUMER_GROUP, "stopped", {consumer.STREAM_KEY: ">"})
    publisher = SyncRedis.from_url(pytest_settings.REDIS_DATABASE_URL, decode_responses=True)
    monkeypatch.setattr(signals, "_get_redis", lambda: publisher)
    try:
        for _ in range(12000):
            assert signals._publish_event("worker.heartbeat", {"hostname": "test-worker"}) is True
    finally:
        publisher.close()
    assert await redis.xlen(consumer.STREAM_KEY) == 12001
    assert await redis.xrange(consumer.STREAM_KEY, pending_id, pending_id)
    status = subprocess.run(
        [sys.executable, "-m", "src.queues.event_stream", "status"], check=True, capture_output=True, text=True
    )
    result = json.loads(status.stdout.splitlines()[-1])
    assert result["pending"] == 1 and result["lag"] == 12000 and result["groups_valid"] is True


async def test_stalled_redis_cannot_block_task_observation_indefinitely(monkeypatch):
    from rapidkit_core.config import settings

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    release = threading.Event()

    def stall():
        try:
            connection, _ = listener.accept()
            with connection:
                release.wait(5)
        except OSError:
            pass

    thread = threading.Thread(target=stall, daemon=True)
    thread.start()
    monkeypatch.setattr(signals, "_redis_client", None)
    monkeypatch.setattr(settings, "REDIS_HOST", "127.0.0.1")
    monkeypatch.setattr(settings, "REDIS_PORT", listener.getsockname()[1])
    try:
        async with asyncio.timeout(3):
            assert await asyncio.to_thread(signals._publish_event, "task.success", {"task_id": "stalled"}) is False
    finally:
        release.set()
        listener.close()
        await asyncio.to_thread(thread.join, 1)


@pytest.mark.skipif(not hasattr(os, "fork"), reason="Requires a prefork platform")
def test_prefork_does_not_inherit_locked_publication_counter_or_parent_counts(monkeypatch):
    monkeypatch.setattr(signals, "_publication_counts", {"successes": 7, "failures": 3})
    read_fd, write_fd = os.pipe()
    with signals._publication_lock:
        child = os.fork()
        if child == 0:
            os.close(read_fd)
            try:
                os.write(write_fd, json.dumps(signals.publication_status()).encode())
            finally:
                os._exit(0)
    os.close(write_fd)
    try:
        ready, _, _ = select.select([read_fd], [], [], 1)
        assert ready, "prefork child inherited a permanently locked counter"
        assert json.loads(os.read(read_fd, 4096)) == {"successes": 0, "failures": 0}
    finally:
        os.close(read_fd)
        if os.waitpid(child, os.WNOHANG)[0] == 0:
            os.kill(child, signal.SIGKILL)
            os.waitpid(child, 0)
