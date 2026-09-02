"""Operations dashboard data provided by the monitoring plugin."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable, Literal

from rapidkit_common.protocols.operations import (
    ApiErrorComparison,
    MonitoringOperationsProvider,
    OperationsTrendPoint,
    SyncSnapshot,
)
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.timezone import timezone
from sqlmodel import col, select

from plugin_monitoring.models import ApiMetricsHourly

LAST_SYNC_KEY = "monitoring:last_successful_sync_at"
LAST_SYNC_ERROR_KEY = "monitoring:last_sync_error"
SYNC_DELAY_SECONDS = 120


def build_daily_points(rows: Iterable[ApiMetricsHourly], start: date, end: date) -> list[OperationsTrendPoint]:
    buckets: dict[date, dict[str, float]] = defaultdict(lambda: {"requests": 0, "weighted_ms": 0.0})
    for row in rows:
        local_date = timezone.to_local(row.time_bucket).date()
        requests = int(row.request_count)
        buckets[local_date]["requests"] += requests
        buckets[local_date]["weighted_ms"] += float(row.avg_ms) * requests

    points: list[OperationsTrendPoint] = []
    cursor = start
    while cursor < end:
        bucket = buckets[cursor]
        requests = int(bucket["requests"])
        points.append(
            OperationsTrendPoint(
                date=cursor.isoformat(),
                request_count=requests,
                avg_response_ms=round(bucket["weighted_ms"] / requests, 2) if requests else None,
            )
        )
        cursor += timedelta(days=1)
    return points


class MonitoringOperationsProviderImpl(MonitoringOperationsProvider):
    def __init__(self, session_factory=AsyncSessionLocal, redis_factory=RedisManager.client):
        self._session_factory = session_factory
        self._redis_factory = redis_factory

    async def _rows(self, start: datetime, end: datetime) -> list[ApiMetricsHourly]:
        async with self._session_factory() as session:
            statement = select(ApiMetricsHourly).where(
                col(ApiMetricsHourly.time_bucket) >= start,
                col(ApiMetricsHourly.time_bucket) < end,
            )
            return list((await session.exec(statement)).all())

    async def get_api_error_comparison(
        self,
        today_start: datetime,
        tomorrow_start: datetime,
    ) -> ApiErrorComparison:
        yesterday_start = today_start - timedelta(days=1)
        rows = await self._rows(yesterday_start, tomorrow_start)

        def rate(start: datetime, end: datetime) -> float | None:
            matching = [row for row in rows if start <= row.time_bucket < end]
            requests = sum(int(row.request_count) for row in matching)
            errors = sum(int(row.error_count) for row in matching)
            return round(errors / requests * 100, 2) if requests else None

        return ApiErrorComparison(
            today_rate=rate(today_start, tomorrow_start),
            yesterday_rate=rate(yesterday_start, today_start),
        )

    async def get_trend(self, start: datetime, end: datetime) -> list[OperationsTrendPoint]:
        rows = await self._rows(start, end)
        return build_daily_points(rows, timezone.to_local(start).date(), timezone.to_local(end).date())

    async def get_sync_snapshot(self, now: datetime) -> SyncSnapshot:
        redis = self._redis_factory()
        value, error = await redis.mget(LAST_SYNC_KEY, LAST_SYNC_ERROR_KEY)
        last_sync = datetime.fromisoformat(value) if value else None
        status: Literal["healthy", "delayed", "failed"]
        if error:
            status = "failed"
        elif last_sync is None or (now - last_sync).total_seconds() > SYNC_DELAY_SECONDS:
            status = "delayed"
        else:
            status = "healthy"
        return SyncSnapshot(last_sync_at=last_sync, status=status)
