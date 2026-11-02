import asyncio
import json

import pytest


def test_dependency_logs_are_bounded_private_and_fast_success_is_silent(monkeypatch, tmp_path):
    from rapidkit_core import dependency_observation as observation
    from rapidkit_core import log, runtime_state
    from rapidkit_core.config import settings
    from rapidkit_core.nanoid import request_id_scope

    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 10_000)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    try:
        with request_id_scope("abcdefghijklmnopqrstu"):
            with observation.observe_dependency("redis", "get"):
                pass
            assert not records
            error = TimeoutError("private://user:password@server/object?token=sentinel")
            with pytest.raises(TimeoutError) as caught:
                with observation.observe_dependency("redis", "get"):
                    raise error
            assert caught.value is error
        assert len(records) == 1
        event = records[0]
        assert (event["event"], event["component"], event["operation"]) == ("dependency.failed", "redis", "get")
        assert event["request_id"] == "abcdefghijklmnopqrstu" and event["retryable"] is True
        assert "sentinel" not in json.dumps(records) and "password" not in json.dumps(records)
        monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 0)
        with observation.observe_dependency("minio", "http.get"):
            pass
        assert records[-1]["event"] == "dependency.slow"
        with pytest.raises(ValueError):
            with observation.observe_dependency("private-server", "secret-key"):
                pass
        runtime_state.start("api", tmp_path)
        runtime_state.write_snapshot()
        snapshot = next(tmp_path.glob("*.json")).read_text()
        assert "dependencies" in snapshot and "sentinel" not in snapshot
    finally:
        runtime_state.stop()
        log.logger.remove(handler)


async def test_observation_preserves_cancellation_and_reporting_failure(monkeypatch):
    from rapidkit_core import dependency_observation as observation

    def unavailable(*args, **kwargs):
        raise OSError("synthetic monitoring outage")

    monkeypatch.setattr(observation, "record_dependency", unavailable)
    with observation.observe_dependency("redis", "get"):
        result = 17
    assert result == 17
    cancellation = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError) as caught:
        with observation.observe_dependency("redis", "get"):
            raise cancellation
    assert caught.value is cancellation


async def test_real_postgres_pool_exhaustion_is_separate_from_slow_sql(monkeypatch):
    from rapidkit_core import database_observation as observation
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 10)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    engine = create_async_engine(
        str(settings.ASYNC_DATABASE_POSTGRESQL_URL),
        poolclass=observation.ObservedAsyncPool,
        pool_size=1,
        max_overflow=0,
        pool_timeout=0.05,
        hide_parameters=True,
    )
    observation.instrument_sql(engine.sync_engine)
    try:
        async with engine.connect() as held:
            records.clear()
            with pytest.raises(Exception):
                async with engine.connect():
                    pass
            assert any(row["event"] == "dependency.failed" and row["operation"] == "pool.acquire" for row in records)
            assert not any(row["operation"].startswith("query.") for row in records)
            records.clear()
            await held.execute(text("SELECT pg_sleep(0.03), :private_value"), {"private_value": "secret-sql-bind"})
            assert any(row["event"] == "dependency.slow" and row["operation"] == "query.select" for row in records)
            assert "secret-sql-bind" not in json.dumps(records)
    finally:
        await engine.dispose()
        log.logger.remove(handler)


async def test_real_redis_inherited_commands_pipeline_and_failures_are_private(monkeypatch):
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from rapidkit_core.redis_client import AsyncRedisClient
    from redis.exceptions import ResponseError

    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 0)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    client = AsyncRedisClient.from_url(str(settings.REDIS_URL), decode_responses=True)
    try:
        await client.set("private-redis-key", "private-redis-value")
        assert await client.get("private-redis-key") == "private-redis-value"
        async with client.pipeline(transaction=False) as pipeline:
            pipeline.get("private-redis-key")
            pipeline.exists("private-redis-key")
            assert await pipeline.execute() == ["private-redis-value", 1]
        with pytest.raises(ResponseError):
            await client.execute_command("NOT_A_COMMAND", "private-redis-key")
        assert {"set", "get", "pipeline", "other"} <= {row["operation"] for row in records}
        assert "private-redis" not in json.dumps(records)
    finally:
        await client.delete("private-redis-key")
        await client.aclose()
        log.logger.remove(handler)


async def test_expected_redis_blocking_wait_is_measured_without_slow_warning(monkeypatch):
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from rapidkit_core.redis_client import AsyncRedisClient

    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 1)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    client = AsyncRedisClient.from_url(str(settings.REDIS_URL), decode_responses=True)
    try:
        assert await client.blpop("synthetic-unpopulated-key", timeout=0.02) is None  # ty: ignore[invalid-await]
        assert not records  # Intentional idle waits are not a slow dependency incident.
    finally:
        await client.aclose()
        log.logger.remove(handler)


async def test_real_sql_cancellation_is_not_counted_as_success(monkeypatch):
    from rapidkit_core import database_observation as observation
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    engine = create_async_engine(
        str(settings.ASYNC_DATABASE_POSTGRESQL_URL), poolclass=observation.ObservedAsyncPool, hide_parameters=True
    )
    observation.instrument_sql(engine.sync_engine)
    try:
        async with engine.connect() as connection:
            records.clear()
            executing = asyncio.create_task(connection.execute(text("SELECT pg_sleep(2)")))
            await asyncio.sleep(0.03)
            executing.cancel()
            with pytest.raises(asyncio.CancelledError):
                await executing
            assert any(row.get("operation") == "query.select" and row["outcome"] == "cancelled" for row in records)
            assert not any(row.get("operation") == "query.select" and row["outcome"] == "success" for row in records)
    finally:
        await engine.dispose()
        log.logger.remove(handler)
