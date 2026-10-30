"""
API 指标归档任务。

将 Redis 小时累计快照幂等写入 Postgres 小时归档表。

Author : Coke
Date   : 2026-04-13
"""

import json
import re
from collections.abc import Awaitable
from datetime import datetime, timedelta
from typing import cast

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient as AsyncRedis
from rapidkit_core.timezone import timezone
from sqlalchemy.ext.asyncio import async_sessionmaker

from plugin_monitoring.crud import ApiMetricsCRUD
from plugin_monitoring.operations import LAST_SYNC_ERROR_KEY, LAST_SYNC_KEY

logger = get_plugin_logger("Monitoring")

_HOUR_PATTERN = re.compile(r"^metrics:api_hour:(\d{8}_\d{2}):(\w+):(.+)$")

# Capture the legacy database baseline once, before any snapshot is committed.
# An expired source must not be recreated as an immortal baseline-only hash.
_BASELINE_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 0 then return {} end
redis.call('HSETNX', KEYS[1], 'baseline', ARGV[1])
return redis.call('HGETALL', KEYS[1])
"""
_ACK_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 1 then
    redis.call('HSET', KEYS[1], 'archived_count', ARGV[1])
end
return 1
"""


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

    归档小时累计快照。分钟指标不被消费，继续供实时 API 使用。

    Args:
        redis: 异步 Redis 客户端（由 Task 基类注入）。
        session_factory: 异步数据库 session 工厂（由 Task 基类注入）。
    """
    now = timezone.now()
    committed: list[tuple[str, int]] = []
    seen: set[str] = set()
    async with session_factory() as session:
        crud = ApiMetricsCRUD(session)
        async for key in redis.scan_iter(match="metrics:api_hour:*", count=200):
            match = _HOUR_PATTERN.match(key)
            if not match or key in seen:
                continue
            seen.add(key)
            bucket, method, path = match.groups()
            data = await redis.hgetall(key)
            if not data or "count" not in data:
                continue
            count = int(data["count"])
            if count == int(data.get("archived_count", -1)):
                continue
            time_bucket = datetime.strptime(bucket, "%Y%m%d_%H")
            if "baseline" not in data:
                previous = await crud.get_hourly(time_bucket, method, path)
                baseline = {
                    "count": previous.request_count if previous else 0,
                    "errors": previous.error_count if previous else 0,
                    "total_ms": previous.avg_ms * previous.request_count if previous else 0,
                    "p95_ms": previous.p95_ms if previous else 0,
                }
                raw = await cast(Awaitable[list[str]], redis.eval(_BASELINE_SCRIPT, 1, key, json.dumps(baseline)))
                data = dict(zip(raw[::2], raw[1::2]))
                if "count" not in data:
                    continue
                count = int(data["count"])
            baseline = json.loads(data["baseline"])
            total_count = baseline["count"] + count
            total_ms = baseline["total_ms"] + float(data.get("total_ms", 0))
            # Read minute keys after the counter snapshot so newly created samples
            # are discoverable even while requests are arriving.
            recent_keys = [
                f"metrics:api_rt:{(now - timedelta(minutes=offset)):%Y%m%d_%H%M}:{method}:{path}"
                for offset in range(3)
                if (now - timedelta(minutes=offset)).strftime("%Y%m%d_%H") == bucket
            ]
            p95_ms = max(baseline["p95_ms"], await _compute_p95(redis, recent_keys))
            await crud.upsert_hourly(
                time_bucket=time_bucket,
                method=method,
                path=path,
                request_count=total_count,
                error_count=baseline["errors"] + int(data.get("errors", 0)),
                avg_ms=round(total_ms / total_count, 2) if total_count else 0,
                p95_ms=p95_ms,
            )
            committed.append((key, count))
        await session.commit()
    # Never acknowledge before the database commit. A crash in this interval
    # simply replays the same absolute snapshot, rather than adding it twice.
    for key, count in committed:
        await cast(Awaitable[int], redis.eval(_ACK_SCRIPT, 1, key, count))
    await redis.set(LAST_SYNC_KEY, timezone.now().isoformat())
    await redis.delete(LAST_SYNC_ERROR_KEY)


async def cleanup_old_metrics(session_factory: async_sessionmaker, days: int = 7) -> None:
    """清理过期的 API 指标归档数据。"""
    async with session_factory() as session:
        crud = ApiMetricsCRUD(session)
        deleted = await crud.cleanup_old(days=days)
        await session.commit()
        if deleted:
            logger.info("Cleaned up {deleted} expired API metrics rows.", deleted=deleted)
