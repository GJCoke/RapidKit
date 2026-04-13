"""
Dashboard 定时推送任务。

Author : Coke
Date   : 2026-04-10
"""

import asyncio
import socket as _socket

import psutil
from fastapi_sio_di import AsyncServer

from src.core.database import RedisManager
from src.core.log import logger
from src.domains.system.services import MetricsService

HOSTNAME = _socket.gethostname()
_RESOURCE_KEY_PREFIX = "sys:resources:"
_RESOURCE_TTL = 60


async def push_resources_loop(sio: AsyncServer) -> None:
    """每 10 秒采集服务器资源，写入 Redis 并推送到 /dashboard 命名空间。"""
    psutil.cpu_percent(interval=None)
    net_prev = psutil.net_io_counters()
    await asyncio.sleep(1)

    while True:
        try:
            redis = RedisManager.client()
            cpu = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            net = psutil.net_io_counters()

            # 计算每秒网络速率（字节/秒），采集间隔 10 秒
            net_sent_rate = max(0, (net.bytes_sent - net_prev.bytes_sent)) // 10
            net_recv_rate = max(0, (net.bytes_recv - net_prev.bytes_recv)) // 10
            net_prev = net

            data = {
                "hostname": HOSTNAME,
                "cpuPercent": cpu,
                "memoryUsed": mem.used,
                "memoryTotal": mem.total,
                "memoryPercent": mem.percent,
                "diskUsed": disk.used,
                "diskTotal": disk.total,
                "diskPercent": disk.percent,
                "netSent": net_sent_rate,
                "netRecv": net_recv_rate,
            }

            # 写入 Redis Hash，TTL 自动过期离线实例
            key = f"{_RESOURCE_KEY_PREFIX}{HOSTNAME}"
            await redis.hset(key, mapping={k: str(v) for k, v in data.items()})
            await redis.expire(key, _RESOURCE_TTL)

            # Socket 推送（携带 hostname）
            await sio.emit("dashboard:resources", data, namespace="/dashboard")
        except Exception:
            logger.debug("Failed to push resources", exc_info=True)

        await asyncio.sleep(10)


async def push_error_stats_loop(sio: AsyncServer) -> None:
    """每 30 秒推送错误统计数据到 /dashboard 命名空间。"""
    while True:
        try:
            redis = RedisManager.client()
            metrics = MetricsService(redis)
            http_5xx, biz_errors = await metrics.get_error_counts(hours=1)
            total = await metrics.get_total_requests(hours=1)
            error_rate = round((http_5xx + biz_errors) / total * 100, 2) if total > 0 else 0.0

            await sio.emit(
                "dashboard:error_stats",
                {
                    "http5xxCount": http_5xx,
                    "bizErrorCount": biz_errors,
                    "totalRequests": total,
                    "errorRate": error_rate,
                },
                namespace="/dashboard",
            )
        except Exception:
            logger.debug("Failed to push error stats", exc_info=True)

        await asyncio.sleep(30)
