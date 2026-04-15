"""
系统领域服务。

Author : Coke
Date   : 2026-04-10
"""

import asyncio
from datetime import timedelta
from typing import Any

from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.timezone import timezone
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_system.crud import ActivityLogCRUD
from plugin_system.models import ActivityLog


class ActivityService:
    """系统活动日志服务。"""

    def __init__(self, session: AsyncSession, sio: "Any | None" = None) -> None:
        self.session = session
        self.sio = sio
        self.crud = ActivityLogCRUD(ActivityLog, session=session)

    async def log_activity(
        self,
        *,
        event_type: str,
        params: dict | None = None,
        detail: str | None = None,
        source_ip: str | None = None,
    ) -> ActivityLog:
        """记录活动日志并通过 Socket.IO 推送。"""
        record = await self.crud.create(
            {"event_type": event_type, "params": params or {}, "detail": detail, "source_ip": source_ip},
            auto_commit=True,
        )

        if self.sio is not None:
            try:
                from plugin_system.schemas import ActivityResponse

                payload = ActivityResponse.model_validate(record).serializable_dict()
                await self.sio.emit("dashboard:activity", payload, namespace="/dashboard")
            except Exception:
                logger.debug("Failed to emit dashboard:activity", exc_info=True)

        return record

    @staticmethod
    def log_activity_fire_and_forget(
        *,
        event_type: str,
        params: dict | None = None,
        detail: str | None = None,
        source_ip: str | None = None,
        sio: Any | None = None,
    ) -> None:
        """在后台创建活动日志（用于中间件/异常处理器等非 DI 上下文）。"""

        async def _do() -> None:
            try:
                async with AsyncSessionLocal() as session:
                    service = ActivityService(session=session, sio=sio)
                    await service.log_activity(
                        event_type=event_type,
                        params=params,
                        detail=detail,
                        source_ip=source_ip,
                    )
            except Exception:
                logger.debug("Failed to log activity (fire-and-forget)", exc_info=True)

        asyncio.create_task(_do())


class MetricsService:
    """指标聚合服务，从 Redis 读取中间件写入的指标数据。"""

    def __init__(self, redis: AsyncRedisClient) -> None:
        self.redis = redis

    async def get_qps(self, minutes: int = 60) -> float:
        """计算最近 N 分钟的平均 QPS。"""
        now = timezone.now()
        total = 0
        for i in range(minutes):
            bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
            count = await self.redis.hget(f"metrics:qps:{bucket}", "count")  # ty: ignore[invalid-await]
            if count:
                total += int(count)
        return round(total / (minutes * 60), 2) if minutes > 0 else 0

    async def get_response_time_percentiles(self, minutes: int = 60) -> tuple[float, float]:
        """计算最近 N 分钟的 P50 和 P95 响应时间。"""
        now = timezone.now()
        all_times: list[float] = []
        for i in range(minutes):
            bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
            key = f"metrics:rt:{bucket}"
            scores = await self.redis.zrangebyscore(key, "-inf", "+inf", withscores=True)
            if scores:
                all_times.extend(score for _, score in scores)

        if not all_times:
            return 0.0, 0.0

        all_times.sort()
        n = len(all_times)
        p50 = all_times[int(n * 0.5)]
        p95 = all_times[int(n * 0.95)] if n > 1 else all_times[0]
        return round(p50, 2), round(p95, 2)

    async def get_error_counts(self, hours: int = 1) -> tuple[int, int]:
        """获取最近 N 小时的 HTTP 5xx 和业务异常计数。"""
        now = timezone.now()
        http_5xx = 0
        biz_errors = 0
        for i in range(hours):
            bucket = (now - timedelta(hours=i)).strftime("%Y%m%d_%H")
            count_5xx = await self.redis.hget(f"metrics:errors:5xx:{bucket}", "count")  # ty: ignore[invalid-await]
            count_biz = await self.redis.hget(f"metrics:errors:biz:{bucket}", "count")  # ty: ignore[invalid-await]
            if count_5xx:
                http_5xx += int(count_5xx)
            if count_biz:
                biz_errors += int(count_biz)
        return http_5xx, biz_errors

    async def get_total_requests(self, hours: int = 1) -> int:
        """获取最近 N 小时的总请求数。"""
        now = timezone.now()
        total = 0
        for i in range(hours * 60):
            bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
            count = await self.redis.hget(f"metrics:qps:{bucket}", "count")  # ty: ignore[invalid-await]
            if count:
                total += int(count)
        return total

    async def get_error_sparkline_24h(self) -> list[float]:
        """获取过去 24 小时每小时的错误数。"""
        now = timezone.now()
        sparkline: list[float] = []
        for i in range(23, -1, -1):
            bucket = (now - timedelta(hours=i)).strftime("%Y%m%d_%H")
            count_5xx = await self.redis.hget(f"metrics:errors:5xx:{bucket}", "count")  # ty: ignore[invalid-await]
            count_biz = await self.redis.hget(f"metrics:errors:biz:{bucket}", "count")  # ty: ignore[invalid-await]
            total = (int(count_5xx) if count_5xx else 0) + (int(count_biz) if count_biz else 0)
            sparkline.append(float(total))
        return sparkline
