"""Archive real Redis snapshots into an isolated PostgreSQL table."""

from datetime import datetime

import plugin_monitoring.aggregator as aggregator
import pytest
import pytest_asyncio
from plugin_monitoring.crud import ApiMetricsCRUD
from plugin_monitoring.models import ApiMetricsHourly
from plugin_monitoring.services import get_realtime_stats
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.middlewares import metrics

PATH = "/api/v1/auth/user/info"
HOUR = datetime(2026, 10, 30, 10)
HOUR_KEY = f"metrics:api_hour:20261030_10:GET:{PATH}"
pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def archive_db(pg_engine):
    async with pg_engine.begin() as connection:
        await connection.run_sync(ApiMetricsHourly.__table__.create)
    yield async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with pg_engine.begin() as connection:
        await connection.run_sync(ApiMetricsHourly.__table__.drop)


@pytest.fixture
def clock(monkeypatch, redis):
    current = [HOUR.replace(minute=59, second=30)]
    monkeypatch.setattr(metrics.timezone, "now", lambda: current[0])
    monkeypatch.setattr(metrics.RedisManager, "client", lambda: redis)
    return current


async def record(duration=10, status=200):
    await metrics._record_metrics(status_code=status, duration_ms=duration, path=PATH, method="GET")


async def rows(factory):
    async with factory() as session:
        return list((await session.exec(select(ApiMetricsHourly))).all())


async def test_replaying_a_snapshot_does_not_count_the_same_request_twice(archive_db, redis, clock):
    await record()
    await aggregator.aggregate_once(redis, archive_db)
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert result.request_count == 1
    assert result.avg_ms == 10
    assert (await get_realtime_stats(redis))["totalRequests"] == 1
    assert await redis.ttl(HOUR_KEY) > 120


async def test_growing_snapshots_keep_weighted_latency_errors_and_p95(archive_db, redis, clock):
    await record(10)
    await aggregator.aggregate_once(redis, archive_db)
    await record(30, 500)
    await aggregator.aggregate_once(redis, archive_db)
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert (result.request_count, result.error_count, result.avg_ms, result.p95_ms) == (2, 1, 20, 30)


async def test_delayed_archive_uses_source_hour_across_midnight(archive_db, redis, clock):
    clock[0] = datetime(2026, 10, 30, 23, 59, 30)
    await record()
    clock[0] = datetime(2026, 10, 31, 0, 1)
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert result.time_bucket == datetime(2026, 10, 30, 23)


async def test_existing_archive_is_a_fixed_baseline_not_added_on_each_retry(archive_db, redis, clock):
    async with archive_db() as session:
        session.add(
            ApiMetricsHourly(
                time_bucket=HOUR, method="GET", path=PATH, request_count=4, error_count=1, avg_ms=10, p95_ms=40
            )
        )
        await session.commit()
    await record(20, 500)
    await aggregator.aggregate_once(redis, archive_db)
    await record(30)
    await aggregator.aggregate_once(redis, archive_db)
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert (result.request_count, result.error_count, result.avg_ms, result.p95_ms) == (6, 2, 15, 40)


async def test_failed_commit_can_retry_without_losing_or_duplicating(archive_db, redis, clock, monkeypatch):
    await record()

    async def fail_once(session):
        raise RuntimeError("database unavailable")

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "commit", fail_once)
        with pytest.raises(RuntimeError, match="database unavailable"):
            await aggregator.aggregate_once(redis, archive_db)
    assert not await rows(archive_db)
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert result.request_count == 1


async def test_committed_snapshot_replays_safely_after_acknowledgement_failure(archive_db, redis, clock, monkeypatch):
    await record()
    original_eval = redis.eval

    async def fail_ack(script, *args):
        if "archived_count" in script:
            raise RuntimeError("redis unavailable")
        return await original_eval(script, *args)

    with monkeypatch.context() as patch:
        patch.setattr(redis, "eval", fail_ack)
        with pytest.raises(RuntimeError, match="redis unavailable"):
            await aggregator.aggregate_once(redis, archive_db)
    assert (await rows(archive_db))[0].request_count == 1
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert result.request_count == 1


async def test_ingress_during_commit_is_included_in_the_next_snapshot(archive_db, redis, clock, monkeypatch):
    await record(10)
    original = AsyncSession.commit

    async def commit_and_receive(session):
        await original(session)
        await record(30)

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "commit", commit_and_receive)
        await aggregator.aggregate_once(redis, archive_db)
    await aggregator.aggregate_once(redis, archive_db)
    (result,) = await rows(archive_db)
    assert (result.request_count, result.avg_ms) == (2, 20)


async def test_stale_absolute_snapshot_cannot_reduce_archived_totals(archive_db):
    async with archive_db() as session:
        crud = ApiMetricsCRUD(session)
        for count in [2, 1, 2]:
            await crud.upsert_hourly(
                time_bucket=HOUR, method="GET", path=PATH, request_count=count, error_count=0, avg_ms=10, p95_ms=10
            )
        await session.commit()
    (result,) = await rows(archive_db)
    assert result.request_count == 2
