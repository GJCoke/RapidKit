"""
API 指标归档任务。

将 Redis 中的分钟级 API 指标聚合写入 Postgres 小时归档表。

Author : Coke
Date   : 2026-04-13
"""

import re
from collections import defaultdict

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from redis.asyncio import Redis as AsyncRedis
from sqlalchemy.ext.asyncio import async_sessionmaker

from plugin_monitoring.crud import ApiMetricsCRUD

logger = get_plugin_logger("Monitoring")

# Redis key 模式
_QPS_PATTERN = re.compile(r"^metrics:api:(\d{8}_\d{4}):(\w+):(.+)$")
_RT_PREFIX = "metrics:api_rt"


async def _collect_minute_keys(redis: AsyncRedis) -> dict[tuple[str, str], dict]:
    """
    扫描 Redis 中的分钟级 API 指标 key，按 (method, path) 分组聚合。

    Returns:
        {(method, path): {count, errors, total_ms, rt_keys}}
    """
    grouped: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"count": 0, "errors": 0, "total_ms": 0.0, "rt_keys": []}
    )

    cursor: int = 0
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match="metrics:api:*", count=200)
        for key in keys:
            if key.startswith(_RT_PREFIX):
                continue
            m = _QPS_PATTERN.match(key)
            if not m:
                continue
            minute_bucket, method, path = m.group(1), m.group(2), m.group(3)
            data = await redis.hgetall(key)  # type: ignore[misc]  # ty: ignore[invalid-await]
            if not data:
                continue

            ep = grouped[(method, path)]
            ep["count"] += int(data.get("count", 0))
            ep["errors"] += int(data.get("errors", 0))
            ep["total_ms"] += float(data.get("total_ms", 0))
            ep["rt_keys"].append(f"{_RT_PREFIX}:{minute_bucket}:{method}:{path}")

        if cursor == "0" or cursor == 0:
            break

    return dict(grouped)


async def _compute_p95(redis: AsyncRedis, rt_keys: list[str]) -> float:
    """从多个 Sorted Set 中合并响应时间并计算 P95。"""
    all_times: list[float] = []
    for key in rt_keys:
        members = await redis.zrangebyscore(key, "-inf", "+inf", withscores=True)
        all_times.extend(score for _, score in members)

    if not all_times:
        return 0.0

    all_times.sort()
    idx = int(len(all_times) * 0.95)
    idx = min(idx, len(all_times) - 1)
    return round(all_times[idx], 2)


async def aggregate_once(redis: AsyncRedis, session_factory: async_sessionmaker) -> None:
    """
    单次执行 API 指标聚合。

    将 Redis 分钟级数据聚合写入 Postgres 小时归档表。由 Celery Beat 定时调用。

    Args:
        redis: 异步 Redis 客户端（由 Task 基类注入）。
        session_factory: 异步数据库 session 工厂（由 Task 基类注入）。
    """
    grouped = await _collect_minute_keys(redis)

    if not grouped:
        return

    now = timezone.now()
    time_bucket = now.replace(minute=0, second=0, microsecond=0)

    async with session_factory() as session:
        crud = ApiMetricsCRUD(session)

        for (method, path), data in grouped.items():
            count = data["count"]
            avg_ms = round(data["total_ms"] / count, 2) if count > 0 else 0.0
            p95_ms = await _compute_p95(redis, data["rt_keys"])

            await crud.upsert_hourly(
                time_bucket=time_bucket,
                method=method,
                path=path,
                request_count=count,
                error_count=data["errors"],
                avg_ms=avg_ms,
                p95_ms=p95_ms,
            )

        await session.commit()


async def cleanup_old_metrics(session_factory: async_sessionmaker, days: int = 7) -> None:
    """清理过期的 API 指标归档数据。"""
    async with session_factory() as session:
        crud = ApiMetricsCRUD(session)
        deleted = await crud.cleanup_old(days=days)
        await session.commit()
        if deleted:
            logger.info("Cleaned up {deleted} expired API metrics rows.", deleted=deleted)
