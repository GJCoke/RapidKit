"""
API 监控服务。

Author : Coke
Date   : 2026-04-13
"""

from datetime import datetime, timedelta

from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_core.redis_client import AsyncRedisClient
from plugin_monitoring.crud import ApiMetricsCRUD
from plugin_monitoring.models import ApiMetricsHourly
from plugin_monitoring.schemas import (
    ApiDistributionItem,
    ApiListItem,
    ApiOverviewResponse,
    ApiTopItem,
    ApiTrendPoint,
)
from rapidkit_core.timezone import timezone


def _parse_range(range_str: str, start_str: str | None, end_str: str | None) -> tuple[datetime, datetime]:
    """将 range 参数转为 (start, end) datetime。"""
    now = timezone.now()
    if start_str and end_str:
        return datetime.fromisoformat(start_str), datetime.fromisoformat(end_str)

    mapping = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}
    hours = mapping.get(range_str, 24)
    return now - timedelta(hours=hours), now


class ApiMetricsService:
    """API 监控指标服务。"""

    def __init__(self, redis: AsyncRedisClient, session: AsyncSession) -> None:
        self.redis = redis
        self.session = session
        self.crud = ApiMetricsCRUD(ApiMetricsHourly, session=session)

    async def get_overview(
        self, range_str: str = "24h", start: str | None = None, end: str | None = None
    ) -> ApiOverviewResponse:
        """获取 API 监控概览。"""
        start_dt, end_dt = _parse_range(range_str, start, end)
        rows = await self.crud.get_aggregated(start_dt, end_dt)

        total_requests = 0
        total_errors = 0
        total_ms_weighted = 0.0
        busiest = None

        for row in rows:
            req = int(row.request_count)
            err = int(row.error_count)
            avg = float(row.avg_ms)
            total_requests += req
            total_errors += err
            total_ms_weighted += avg * req
            if busiest is None or req > busiest[2]:
                busiest = (row.path, row.method, req)

        avg_error_rate = round(total_errors / total_requests * 100, 2) if total_requests > 0 else 0
        avg_ms = round(total_ms_weighted / total_requests, 2) if total_requests > 0 else 0

        return ApiOverviewResponse(
            total_requests=total_requests,
            total_errors=total_errors,
            avg_error_rate=avg_error_rate,
            avg_ms=avg_ms,
            busiest_path=busiest[0] if busiest else None,
            busiest_method=busiest[1] if busiest else None,
            busiest_count=busiest[2] if busiest else 0,
        )

    async def get_top(
        self,
        range_str: str = "24h",
        start: str | None = None,
        end: str | None = None,
        sort_by: str = "requests",
        limit: int = 10,
    ) -> list[ApiTopItem]:
        """获取 Top N 排行。"""
        start_dt, end_dt = _parse_range(range_str, start, end)
        rows = await self.crud.get_aggregated(start_dt, end_dt)

        items = []
        for row in rows:
            req = int(row.request_count)
            err = int(row.error_count)
            items.append(
                ApiTopItem(
                    path=row.path,
                    method=row.method,
                    request_count=req,
                    error_count=err,
                    error_rate=round(err / req * 100, 2) if req > 0 else 0,
                    avg_ms=round(float(row.avg_ms), 2),
                    p95_ms=round(float(row.p95_ms), 2),
                )
            )

        sort_map = {
            "requests": "request_count",
            "errors": "error_count",
            "avg_ms": "avg_ms",
            "p95_ms": "p95_ms",
        }
        field = sort_map.get(sort_by, "request_count")
        items.sort(key=lambda x: getattr(x, field), reverse=True)
        return items[:limit]

    async def get_distribution(
        self, range_str: str = "24h", start: str | None = None, end: str | None = None
    ) -> list[ApiDistributionItem]:
        """获取请求占比分布（Top 8 + 其他）。"""
        start_dt, end_dt = _parse_range(range_str, start, end)
        rows = await self.crud.get_aggregated(start_dt, end_dt)

        items = [
            {
                "path": str(row.path),
                "method": str(row.method),
                "request_count": int(row.request_count),
            }
            for row in rows
        ]
        items.sort(key=lambda x: x["request_count"], reverse=True)
        total = sum(x["request_count"] for x in items)

        result = []
        other_count = 0
        for i, item in enumerate(items):
            if i < 8:
                req_count = int(item["request_count"])
                result.append(
                    ApiDistributionItem(
                        path=str(item["path"]),
                        method=str(item["method"]),
                        request_count=req_count,
                        percentage=round(req_count / total * 100, 2) if total > 0 else 0,
                    )
                )
            else:
                other_count += int(item["request_count"])

        if other_count > 0:
            result.append(
                ApiDistributionItem(
                    path="other",
                    method="*",
                    request_count=other_count,
                    percentage=round(other_count / total * 100, 2) if total > 0 else 0,
                )
            )

        return result

    async def get_trend(
        self, range_str: str = "24h", start: str | None = None, end: str | None = None
    ) -> list[ApiTrendPoint]:
        """获取请求量趋势（按小时桶汇总所有端点）。"""
        start_dt, end_dt = _parse_range(range_str, start, end)

        from sqlalchemy import func
        from sqlmodel import col, select

        sum_req = func.sum(ApiMetricsHourly.request_count).label("request_count")
        sum_err = func.sum(ApiMetricsHourly.error_count).label("error_count")

        stmt = (
            select(
                ApiMetricsHourly.time_bucket,
                sum_req,
                sum_err,
            )
            .where(col(ApiMetricsHourly.time_bucket) >= start_dt)
            .where(col(ApiMetricsHourly.time_bucket) < end_dt)
            .group_by(col(ApiMetricsHourly.time_bucket))
            .order_by(col(ApiMetricsHourly.time_bucket))
        )
        result = await self.session.exec(stmt)  # ty: ignore[no-matching-overload]
        rows = list(result.all())

        return [
            ApiTrendPoint(
                time_bucket=row.time_bucket,
                request_count=int(row.request_count),
                error_count=int(row.error_count),
            )
            for row in rows
        ]

    async def get_list(
        self,
        range_str: str = "24h",
        start: str | None = None,
        end: str | None = None,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "request_count",
        sort_order: str = "desc",
    ) -> dict:
        """获取 API 明细列表（分页）。"""
        start_dt, end_dt = _parse_range(range_str, start, end)
        rows = await self.crud.get_aggregated(start_dt, end_dt)

        items = []
        for row in rows:
            req = int(row.request_count)
            err = int(row.error_count)
            item = ApiListItem(
                path=row.path,
                method=row.method,
                request_count=req,
                error_count=err,
                error_rate=round(err / req * 100, 2) if req > 0 else 0,
                avg_ms=round(float(row.avg_ms), 2),
                p95_ms=round(float(row.p95_ms), 2),
            )
            if keyword and keyword.lower() not in item.path.lower():
                continue
            items.append(item)

        valid_fields = {"request_count", "error_count", "error_rate", "avg_ms", "p95_ms"}
        if sort_by not in valid_fields:
            sort_by = "request_count"
        items.sort(key=lambda x: getattr(x, sort_by), reverse=(sort_order == "desc"))

        total = len(items)
        offset = (page - 1) * page_size
        records = items[offset : offset + page_size]

        return {"records": records, "total": total, "page": page, "page_size": page_size}

    async def get_realtime_stats(self) -> dict:
        """从 Redis 获取实时 API 统计数据（用于 Socket.IO 推送）。"""
        import re
        from collections import defaultdict

        pattern = re.compile(r"^metrics:api:(\d{8}_\d{4}):(\w+):(.+)$")
        grouped: dict[tuple[str, str], dict] = defaultdict(lambda: {"count": 0, "errors": 0})

        cursor: int = 0
        while True:
            cursor, keys = await self.redis.scan(cursor=cursor, match="metrics:api:*", count=200)
            for key in keys:
                if key.startswith("metrics:api_rt"):
                    continue
                m = pattern.match(key)
                if not m:
                    continue
                method, path = m.group(2), m.group(3)
                data = await self.redis.hgetall(key)
                if data:
                    grouped[(method, path)]["count"] += int(data.get("count", 0))
                    grouped[(method, path)]["errors"] += int(data.get("errors", 0))
            if cursor == 0:
                break

        total_requests = sum(v["count"] for v in grouped.values())
        total_errors = sum(v["errors"] for v in grouped.values())
        error_rate = round(total_errors / total_requests * 100, 2) if total_requests > 0 else 0

        failures = sorted(grouped.items(), key=lambda x: x[1]["errors"], reverse=True)[:5]
        top_failures = [
            {
                "path": k[1],
                "method": k[0],
                "requestCount": v["count"],
                "errorCount": v["errors"],
                "errorRate": round(v["errors"] / v["count"] * 100, 2) if v["count"] > 0 else 0,
            }
            for k, v in failures
            if v["errors"] > 0
        ]

        return {
            "totalRequests": total_requests,
            "totalErrors": total_errors,
            "errorRate": error_rate,
            "topFailures": top_failures,
        }
