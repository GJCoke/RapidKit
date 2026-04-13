"""
API 监控实时推送任务。

Author : Coke
Date   : 2026-04-13
"""

import asyncio

from fastapi_sio_di import AsyncServer

from src.core.database import RedisManager
from src.core.log import logger
from src.domains.monitoring.services import ApiMetricsService


async def push_api_stats_loop(sio: AsyncServer) -> None:
    """每 30 秒推送 API 统计增量到 /dashboard 命名空间。"""
    prev_total = 0
    prev_errors = 0

    while True:
        try:
            redis = RedisManager.client()
            # 使用 None session，因为实时推送只读 Redis
            service = ApiMetricsService(redis=redis, session=None)  # ty: ignore[invalid-argument-type]
            stats = await service.get_realtime_stats()

            curr_total = stats["totalRequests"]
            curr_errors = stats.get("totalErrors", 0)

            # 计算增量（首次推送或 Redis key 过期导致回退时，取 0）
            delta_requests = max(0, curr_total - prev_total)
            delta_errors = max(0, curr_errors - prev_errors)
            prev_total = curr_total
            prev_errors = curr_errors

            await sio.emit(
                "dashboard:api_stats",
                {
                    "deltaRequests": delta_requests,
                    "deltaErrors": delta_errors,
                    "errorRate": stats["errorRate"],
                    "topFailures": stats.get("topFailures", []),
                },
                namespace="/dashboard",
            )
        except Exception:
            logger.debug("Failed to push API stats", exc_info=True)

        await asyncio.sleep(30)
