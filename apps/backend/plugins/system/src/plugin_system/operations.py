"""Operations overview orchestration across optional plugin providers."""

import asyncio
from datetime import UTC, date, datetime, time, timedelta
from typing import Awaitable, Literal, TypeVar

from rapidkit_common.protocols.operations import (
    ApiErrorComparison,
    DayComparison,
    MonitoringOperationsProvider,
    QueueSnapshot,
    ServerSnapshot,
    SyncSnapshot,
    TaskSuccessComparison,
    UserOperationsProvider,
    WorkerOperationsProvider,
)
from rapidkit_core.config import settings
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.services import get_service_optional

from plugin_system.schemas import (
    OperationsDayComparison,
    OperationsErrorComparison,
    OperationsOverviewQuery,
    OperationsOverviewResponse,
    OperationsServerSummary,
    OperationsSummary,
    OperationsSystemSummary,
    OperationsTrendPoint,
)

logger = get_plugin_logger("System")
T = TypeVar("T")


def calculate_percent_change(current: int | float, previous: int | float) -> float | None:
    if previous == 0:
        return 0.0 if current == 0 else None
    return round((current - previous) / previous * 100, 2)


def server_status(healthy: int, total: int) -> Literal["healthy", "degraded", "down"]:
    if total > 0 and healthy == total:
        return "healthy"
    if healthy > 0:
        return "degraded"
    return "down"


def _utc_naive(local_date: date) -> datetime:
    local = datetime.combine(local_date, time.min, tzinfo=timezone.tz_info)
    return local.astimezone(UTC).replace(tzinfo=None)


def _boundaries(query: OperationsOverviewQuery) -> tuple[datetime, datetime, datetime, datetime]:
    today = timezone.now_local().date()
    today_start = _utc_naive(today)
    tomorrow_start = _utc_naive(today + timedelta(days=1))
    if query.range == "custom" and query.start and query.end:
        trend_start = _utc_naive(query.start)
        trend_end = _utc_naive(query.end + timedelta(days=1))
    else:
        days = 30 if query.range == "30d" else 7
        trend_start = _utc_naive(today - timedelta(days=days - 1))
        trend_end = tomorrow_start
    return today_start, tomorrow_start, trend_start, trend_end


async def _safe(name: str, awaitable: Awaitable[T]) -> T | None:
    try:
        return await awaitable
    except Exception:
        logger.exception("Operations provider call failed: {}", name)
        return None


async def _none() -> None:
    return None


async def build_operations_overview(query: OperationsOverviewQuery, started_at: datetime) -> OperationsOverviewResponse:
    generated_at = timezone.now()
    today_start, tomorrow_start, trend_start, trend_end = _boundaries(query)
    user_provider = get_service_optional(UserOperationsProvider)
    worker_provider = get_service_optional(WorkerOperationsProvider)
    monitoring_provider = get_service_optional(MonitoringOperationsProvider)
    current_week_start = today_start - timedelta(days=6)
    previous_week_start = current_week_start - timedelta(days=7)

    active_users, servers, tasks, queue, task_success, api_errors, trend, sync = await asyncio.gather(
        _safe("active_users", user_provider.get_active_users(today_start, tomorrow_start))
        if user_provider
        else _none(),
        _safe("servers", worker_provider.get_server_snapshot(generated_at)) if worker_provider else _none(),
        _safe("tasks", worker_provider.get_task_comparison(today_start, tomorrow_start))
        if worker_provider
        else _none(),
        _safe("queue", worker_provider.get_queue_snapshot(generated_at)) if worker_provider else _none(),
        _safe(
            "task_success",
            worker_provider.get_task_success_comparison(current_week_start, generated_at, previous_week_start),
        )
        if worker_provider
        else _none(),
        _safe("api_errors", monitoring_provider.get_api_error_comparison(today_start, tomorrow_start))
        if monitoring_provider
        else _none(),
        _safe("trend", monitoring_provider.get_trend(trend_start, trend_end)) if monitoring_provider else _none(),
        _safe("sync", monitoring_provider.get_sync_snapshot(generated_at)) if monitoring_provider else _none(),
    )

    def day_schema(value: DayComparison | None) -> OperationsDayComparison | None:
        if value is None:
            return None
        return OperationsDayComparison(
            today=value.today,
            yesterday=value.yesterday,
            change_percent=calculate_percent_change(value.today, value.yesterday),
        )

    server_schema = None
    if isinstance(servers, ServerSnapshot):
        server_schema = OperationsServerSummary(
            healthy=servers.healthy,
            total=servers.total,
            status=server_status(servers.healthy, servers.total),
        )
    error_schema = None
    if isinstance(api_errors, ApiErrorComparison):
        error_schema = OperationsErrorComparison(
            today=api_errors.today_rate,
            yesterday=api_errors.yesterday_rate,
            change_points=round(api_errors.today_rate - api_errors.yesterday_rate, 2)
            if api_errors.today_rate is not None and api_errors.yesterday_rate is not None
            else None,
        )
    queue = queue if isinstance(queue, QueueSnapshot) else None
    task_success = task_success if isinstance(task_success, TaskSuccessComparison) else None
    sync = sync if isinstance(sync, SyncSnapshot) else None
    trend_points = trend if isinstance(trend, list) else []

    return OperationsOverviewResponse(
        generated_at=generated_at,
        timezone=settings.DATETIME_TIMEZONE,
        summary=OperationsSummary(
            servers=server_schema,
            active_users=day_schema(active_users if isinstance(active_users, DayComparison) else None),
            tasks=day_schema(tasks if isinstance(tasks, DayComparison) else None),
            api_error_rate=error_schema,
        ),
        trend=[
            OperationsTrendPoint(date=p.date, request_count=p.request_count, avg_response_ms=p.avg_response_ms)
            for p in trend_points
        ],
        system=OperationsSystemSummary(
            started_at=started_at,
            uptime_seconds=max(0, int((generated_at - started_at).total_seconds())),
            queue_depth=queue.current_depth if queue else None,
            queue_depth_yesterday=queue.yesterday_depth if queue else None,
            queue_depth_change_percent=calculate_percent_change(queue.current_depth, queue.yesterday_depth)
            if queue and queue.yesterday_depth is not None
            else None,
            last_sync_at=sync.last_sync_at if sync else None,
            sync_status=sync.status if sync else "unavailable",
            task_success_rate_7d=task_success.current_rate if task_success else None,
            previous_task_success_rate_7d=task_success.previous_rate if task_success else None,
            task_success_rate_change_points=round(task_success.current_rate - task_success.previous_rate, 2)
            if task_success and task_success.current_rate is not None and task_success.previous_rate is not None
            else None,
        ),
    )
