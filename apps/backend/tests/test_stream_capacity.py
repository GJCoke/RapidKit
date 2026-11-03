import asyncio
import json
import time
from pathlib import Path
from uuid import uuid4

import pytest
from prometheus_client import CollectorRegistry, generate_latest
from redis.asyncio import ConnectionPool, Redis
from src.ops.exporter import OperationalSampler
from src.queues.consumer import _ensure_consumer_group
from src.queues.event_stream import CONSUMER_GROUP, DEAD_STREAM_KEY, STREAM_KEY, stream_status


async def test_capacity_acl_failure_does_not_report_reachable_redis_as_down(redis, tmp_path):
    username = "p2-capacity-" + uuid4().hex[:8]
    await redis.execute_command("ACL", "SETUSER", username, "reset", "on", ">synthetic-only", "+ping", "+select")
    limited = Redis.from_pool(
        ConnectionPool(
            connection_class=redis.connection_pool.connection_class,
            max_connections=redis.connection_pool.max_connections,
            **{**redis.connection_pool.connection_kwargs, "username": username, "password": "synthetic-only"},
        )
    )
    try:
        assert await limited.execute_command("PING")
        sampler = OperationalSampler(limited, None, tmp_path, tmp_path, 1000)
        await sampler._sample("redis", sampler._redis)
        assert sampler.status["redis"] == 1, "INFO permissions must not change the independent PING result"
        await sampler._sample("redis_capacity", sampler._redis_capacity)
        assert sampler.status["redis_capacity"] == 0
    finally:
        await limited.aclose()
        await redis.execute_command("ACL", "DELUSER", username)


async def test_stream_and_redis_capacity_are_exported_and_failed_samples_keep_last_values(redis, tmp_path):
    await _ensure_consumer_group(redis)
    empty = await stream_status(redis)
    assert empty["length"] == 0 and empty["memory_bytes"] >= 0 and empty["oldest_age_seconds"] == 0
    await redis.xadd(STREAM_KEY, {"event_type": "worker.heartbeat"}, id="1000-0")
    state = await stream_status(redis)
    assert state["length"] == 1 and state["memory_bytes"] > 0
    assert state["oldest_age_seconds"] > time.time() - 2
    sampler = OperationalSampler(redis, None, tmp_path, tmp_path, 1000)
    await sampler._sample("redis", sampler._redis)
    await sampler._sample("redis_capacity", sampler._redis_capacity)
    await sampler._sample("events", sampler._events)
    registry = CollectorRegistry()
    registry.register(sampler)
    rendered = generate_latest(registry).decode()
    assert "rapidkit_events_length 1.0" in rendered
    assert "rapidkit_events_memory_bytes " in rendered
    assert "rapidkit_events_oldest_age_seconds " in rendered
    assert sampler.values["redis_capacity"]["redis_used_memory_bytes"] > 0
    assert sampler.values["redis_capacity"]["redis_used_memory_rss_bytes"] > 0
    assert sampler.values["redis_capacity"]["redis_maxmemory_bytes"] == (await redis.info("memory"))["maxmemory"]
    assert "redis_aof_enabled" in sampler.values["redis_capacity"]
    assert "redis_aof_current_size_bytes" in sampler.values["redis_capacity"]
    assert "# TYPE rapidkit_redis_evicted_keys_total counter" in rendered
    previous = dict(sampler.values["redis_capacity"])

    class FailedInfo:
        async def ping(self):
            return True

        async def info(self, *args):
            raise PermissionError("synthetic-private-acl")

    sampler.redis = FailedInfo()
    await sampler._sample("redis", sampler._redis)
    await sampler._sample("redis_capacity", sampler._redis_capacity)
    assert sampler.status["redis_capacity"] == 0 and sampler.values["redis_capacity"] == previous
    unavailable = generate_latest(registry).decode()
    assert 'rapidkit_dependency_up{component="redis"} 1.0' in unavailable
    assert "rapidkit_redis_used_memory_bytes " in unavailable
    assert "synthetic-private" not in unavailable


async def test_sampler_bounds_each_round_and_catches_up_acknowledged_history(redis, tmp_path):
    old_ms = int((time.time() - 8 * 86400) * 1000)
    pipe = redis.pipeline(transaction=False)
    ids = [f"{old_ms + i}-0" for i in range(12005)]
    for message_id in ids:
        pipe.xadd(STREAM_KEY, {"event_type": "worker.heartbeat"}, id=message_id)
    await pipe.execute()
    recent = await redis.xadd(STREAM_KEY, {"event_type": "worker.heartbeat"})
    await _ensure_consumer_group(redis)
    await redis.xreadgroup(CONSUMER_GROUP, "fixture", {STREAM_KEY: ">"})
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, *ids, recent)
    await redis.xadd(DEAD_STREAM_KEY, {"reason_code": "synthetic"})
    sampler = OperationalSampler(redis, None, tmp_path, tmp_path, 1000)
    await sampler._sample("stream_trim", sampler._stream_trim)
    assert sampler.status["stream_trim"] == 1
    assert await redis.xlen(STREAM_KEY) == 2006
    assert sampler.values["stream_trim"]["events_trim_removed_total"] == 10000
    await sampler._sample("stream_trim", sampler._stream_trim)
    assert await redis.xrange(STREAM_KEY) == [(recent, {"event_type": "worker.heartbeat"})]
    assert await redis.xlen(DEAD_STREAM_KEY) == 1
    assert sampler.values["stream_trim"]["events_trim_removed_total"] == 12005
    assert sampler.values["stream_trim"]["events_trim_last_run_timestamp_seconds"] > 0
    assert sampler.values["stream_trim"]["events_trim_last_removed_timestamp_seconds"] > 0
    registry = CollectorRegistry()
    registry.register(sampler)
    assert "# TYPE rapidkit_events_trim_removed_total counter" in generate_latest(registry).decode()


async def test_sampler_cannot_trim_pending_unread_or_unknown_groups(redis, tmp_path):
    for number in (1, 2, 3):
        await redis.xadd(STREAM_KEY, {"event_type": "worker.heartbeat"}, id=f"{number}-0")
    recent = await redis.xadd(STREAM_KEY, {"event_type": "worker.heartbeat"})
    await _ensure_consumer_group(redis)
    await redis.xreadgroup(CONSUMER_GROUP, "fixture", {STREAM_KEY: ">"}, count=2)
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, "1-0")
    sampler = OperationalSampler(redis, None, tmp_path, tmp_path, 1000)
    await sampler._sample("stream_trim", sampler._stream_trim)
    assert [row[0] for row in await redis.xrange(STREAM_KEY)] == ["2-0", "3-0", recent]
    assert sampler.values["stream_trim"]["events_trim_removed_total"] == 1
    previous = dict(sampler.values["stream_trim"])
    await redis.xgroup_create(STREAM_KEY, "unregistered", id="0")
    await sampler._sample("stream_trim", sampler._stream_trim)
    assert sampler.status["stream_trim"] == 0 and sampler.values["stream_trim"] == previous
    assert await redis.xlen(STREAM_KEY) == 3


@pytest.mark.docker
async def test_real_stream_maintenance_load_preserves_protected_window(redis, tmp_path):
    payload = {
        "event_type": "worker.heartbeat",
        "data": '{"hostname":"synthetic-worker"}',
        "timestamp": "2026-11-02T00:00:00+00:00",
    }
    old_ms = int((time.time() - 8 * 86400) * 1000)
    pipe = redis.pipeline(transaction=False)
    old_ids = [f"{old_ms + i}-0" for i in range(25000)]
    for message_id in old_ids:
        pipe.xadd(STREAM_KEY, payload, id=message_id)
    await pipe.execute()
    recent = await redis.xadd(STREAM_KEY, payload)
    await _ensure_consumer_group(redis)
    await redis.xreadgroup(CONSUMER_GROUP, "load-fixture", {STREAM_KEY: ">"})
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, *old_ids, recent)
    sampler = OperationalSampler(redis, None, tmp_path, tmp_path, 1000)
    before = await stream_status(redis)
    start = time.monotonic()
    finished = asyncio.Event()
    produced, rounds, latencies = [], [], []

    async def produce():
        for tick in range(30):
            await asyncio.sleep(max(0, start + tick - time.monotonic()))
            batch = redis.pipeline(transaction=False)
            for _ in range(200):
                batch.xadd(STREAM_KEY, payload)
            produced.extend(await batch.execute())
            rows = await redis.xreadgroup(CONSUMER_GROUP, "load-fixture", {STREAM_KEY: ">"})
            await redis.xack(STREAM_KEY, CONSUMER_GROUP, *(row[0] for row in rows[0][1]))
        await asyncio.sleep(max(0, start + 30 - time.monotonic()))

    async def maintain():
        for tick in range(4):
            await asyncio.sleep(max(0, start + tick * 10 - time.monotonic()))
            previous = sampler.trim_removed
            began = time.monotonic()
            await sampler._sample("stream_trim", sampler._stream_trim)
            assert sampler.status["stream_trim"] == 1
            removed = sampler.trim_removed - previous
            assert removed <= 10000
            rounds.append(
                {
                    "at_seconds": time.monotonic() - start,
                    "removed": removed,
                    "duration_seconds": time.monotonic() - began,
                }
            )

    async def business_probe():
        while not finished.is_set():
            began = time.monotonic()
            assert await asyncio.wait_for(redis.ping(), 2)
            latencies.append(time.monotonic() - began)
            await asyncio.sleep(0.01)

    probe = asyncio.create_task(business_probe())
    try:
        await asyncio.gather(produce(), maintain())
    finally:
        finished.set()
        await probe
    after = await stream_status(redis)
    rows = await redis.xrange(STREAM_KEY)
    assert {row[0] for row in rows} == {recent, *produced}
    assert len(produced) == 6000 and after["length"] == 6001
    assert sampler.trim_removed == 25000 and after["pending"] == after["lag"] == 0
    ping_p95 = sorted(latencies)[int(len(latencies) * 0.95)]
    assert ping_p95 < 0.1
    await sampler._sample("redis_capacity", sampler._redis_capacity)
    artifact = (
        Path(__file__).resolve().parents[3]
        / "logs/verification"
        / ("observability-p2-load-" + uuid4().hex[:8] + ".json")
    )
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text(
        json.dumps(
            {
                "duration_seconds": time.monotonic() - start,
                "events_per_second": 200,
                "produced": len(produced),
                "expired_ack_seed": 25000,
                "maintenance_rounds": rounds,
                "business_ping_p95_seconds": ping_p95,
                "before": before,
                "after": after,
                "redis": sampler.values["redis_capacity"],
                "scope": "synthetic event persistence/ACK; not business consumer throughput or production capacity",
            },
            indent=2,
        )
        + "\n"
    )
