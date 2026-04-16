"""
系统领域服务。

Author : Coke
Date   : 2026-04-10
"""

from datetime import timedelta

from fastapi_sio_di import AsyncServer
from rapidkit_core.log import logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.timezone import timezone
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_system.crud import ActivityLogCRUD
from plugin_system.models import ActivityLog


async def log_activity(
    session: AsyncSession,
    *,
    event_type: str,
    params: dict | None = None,
    detail: str | None = None,
    source_ip: str | None = None,
    sio: AsyncServer | None = None,
) -> ActivityLog:
    """记录活动日志并通过 Socket.IO 推送。"""
    crud = ActivityLogCRUD(ActivityLog, session=session)
    record = await crud.create(
        {"event_type": event_type, "params": params or {}, "detail": detail, "source_ip": source_ip},
        auto_commit=True,
    )

    if sio is not None:
        try:
            from plugin_system.schemas import ActivityResponse

            payload = ActivityResponse.model_validate(record).serializable_dict()
            await sio.emit("dashboard:activity", payload, namespace="/dashboard")
        except Exception:
            logger.debug("Failed to emit dashboard:activity", exc_info=True)

    return record


async def get_qps(redis: AsyncRedisClient, minutes: int = 60) -> float:
    """计算最近 N 分钟的平均 QPS。"""
    now = timezone.now()
    total = 0
    for i in range(minutes):
        bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
        count = await redis.hget(f"metrics:qps:{bucket}", "count")  # ty: ignore[invalid-await]
        if count:
            total += int(count)
    return round(total / (minutes * 60), 2) if minutes > 0 else 0


async def get_response_time_percentiles(redis: AsyncRedisClient, minutes: int = 60) -> tuple[float, float]:
    """计算最近 N 分钟的 P50 和 P95 响应时间。"""
    now = timezone.now()
    all_times: list[float] = []
    for i in range(minutes):
        bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
        key = f"metrics:rt:{bucket}"
        scores = await redis.zrangebyscore(key, "-inf", "+inf", withscores=True)
        if scores:
            all_times.extend(score for _, score in scores)

    if not all_times:
        return 0.0, 0.0

    all_times.sort()
    n = len(all_times)
    p50 = all_times[int(n * 0.5)]
    p95 = all_times[int(n * 0.95)] if n > 1 else all_times[0]
    return round(p50, 2), round(p95, 2)


async def get_error_counts(redis: AsyncRedisClient, hours: int = 1) -> tuple[int, int]:
    """获取最近 N 小时的 HTTP 5xx 和业务异常计数。"""
    now = timezone.now()
    http_5xx = 0
    biz_errors = 0
    for i in range(hours):
        bucket = (now - timedelta(hours=i)).strftime("%Y%m%d_%H")
        count_5xx = await redis.hget(f"metrics:errors:5xx:{bucket}", "count")  # ty: ignore[invalid-await]
        count_biz = await redis.hget(f"metrics:errors:biz:{bucket}", "count")  # ty: ignore[invalid-await]
        if count_5xx:
            http_5xx += int(count_5xx)
        if count_biz:
            biz_errors += int(count_biz)
    return http_5xx, biz_errors


async def get_total_requests(redis: AsyncRedisClient, hours: int = 1) -> int:
    """获取最近 N 小时的总请求数。"""
    now = timezone.now()
    total = 0
    for i in range(hours * 60):
        bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
        count = await redis.hget(f"metrics:qps:{bucket}", "count")  # ty: ignore[invalid-await]
        if count:
            total += int(count)
    return total


async def get_error_sparkline_24h(redis: AsyncRedisClient) -> list[float]:
    """获取过去 24 小时每小时的错误数。"""
    now = timezone.now()
    sparkline: list[float] = []
    for i in range(23, -1, -1):
        bucket = (now - timedelta(hours=i)).strftime("%Y%m%d_%H")
        count_5xx = await redis.hget(f"metrics:errors:5xx:{bucket}", "count")  # ty: ignore[invalid-await]
        count_biz = await redis.hget(f"metrics:errors:biz:{bucket}", "count")  # ty: ignore[invalid-await]
        total = (int(count_5xx) if count_5xx else 0) + (int(count_biz) if count_biz else 0)
        sparkline.append(float(total))
    return sparkline
