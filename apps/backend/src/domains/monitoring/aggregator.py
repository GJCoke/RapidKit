"""
API 指标归档定时任务。

每分钟将 Redis 中的分钟级 API 指标聚合写入 Postgres 小时归档表。

Author : Coke
Date   : 2026-04-13
"""

import asyncio
import re
from collections import defaultdict

from src.core.database import AsyncSessionLocal, RedisManager
from src.core.log import logger
from src.domains.monitoring.crud import ApiMetricsCRUD
from src.domains.monitoring.models import ApiMetricsHourly

# Redis key 模式
_QPS_PATTERN = re.compile(r"^metrics:api:(\d{8}_\d{4}):(\w+):(.+)$")
_RT_PREFIX = "metrics:api_rt"

# 清理计数器：每 1440 次循环（约 24 小时）执行一次清理
_CLEANUP_INTERVAL = 1440


async def _collect_minute_keys(redis) -> dict[tuple[str, str], dict]:  # noqa: ANN001
    """
    扫描 Redis 中的分钟级 API 指标 key，按 (method, path) 分组聚合。

    Returns:
        {(method, path): {count, errors, total_ms, rt_keys}}
    """
    grouped: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"count": 0, "errors": 0, "total_ms": 0.0, "rt_keys": []}
    )

    cursor = "0"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match="metrics:api:*", count=200)
        for key in keys:
            # 跳过响应时间 Sorted Set key
            if key.startswith(_RT_PREFIX):
                continue
            m = _QPS_PATTERN.match(key)
            if not m:
                continue
            minute_bucket, method, path = m.group(1), m.group(2), m.group(3)
            data = await redis.hgetall(key)
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


async def _compute_p95(redis, rt_keys: list[str]) -> float:  # noqa: ANN001
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


async def aggregate_api_metrics_loop() -> None:
    """
    API 指标归档主循环。

    每 60 秒将 Redis 分钟级数据聚合写入 Postgres 小时归档表。
    """
    loop_count = 0

    while True:
        await asyncio.sleep(60)
        loop_count += 1

        try:
            redis = RedisManager.client()
            grouped = await _collect_minute_keys(redis)

            if not grouped:
                continue

            # 当前小时的时间桶
            from src.utils.timezone import timezone

            now = timezone.now()
            time_bucket = now.replace(minute=0, second=0, microsecond=0)

            async with AsyncSessionLocal() as session:
                crud = ApiMetricsCRUD(ApiMetricsHourly, session=session)

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

            # 定期清理过期数据
            if loop_count % _CLEANUP_INTERVAL == 0:
                async with AsyncSessionLocal() as session:
                    crud = ApiMetricsCRUD(ApiMetricsHourly, session=session)
                    deleted = await crud.cleanup_old(days=7)
                    if deleted:
                        logger.info(f"Cleaned up {deleted} expired API metrics rows.")

        except Exception:
            logger.debug("Failed to aggregate API metrics", exc_info=True)
