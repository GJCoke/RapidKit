"""
API 监控实时推送任务。

Author : Coke
Date   : 2026-04-13
"""

import asyncio

from fastapi_sio_di import AsyncServer
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger

from plugin_monitoring.services import get_realtime_stats


async def push_api_stats_loop(sio: AsyncServer) -> None:
    """每 30 秒推送 API 统计增量到 /dashboard 命名空间。"""
    prev_total = 0
    prev_errors = 0

    while True:
        try:
            redis = RedisManager.client()
            stats = await get_realtime_stats(redis)

            curr_total = stats["totalRequests"]
            curr_errors = stats.get("totalErrors", 0)

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
