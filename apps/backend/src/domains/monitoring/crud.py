"""
API 监控指标 CRUD 操作。

Author : Coke
Date   : 2026-04-13
"""

from datetime import datetime, timedelta

from sqlalchemy import case, func, text
from sqlalchemy import select as sa_select
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col, delete, select

from src.common.crud import BaseSQLModelCRUD
from src.common.schemas.base import BaseModel
from src.domains.monitoring.models import ApiMetricsHourly


class ApiMetricsCRUD(BaseSQLModelCRUD[ApiMetricsHourly, BaseModel, BaseModel]):
    """API 指标归档 CRUD。"""

    async def upsert_hourly(
        self,
        *,
        time_bucket: datetime,
        method: str,
        path: str,
        request_count: int,
        error_count: int,
        avg_ms: float,
        p95_ms: float,
    ) -> None:
        """
        按 (time_bucket, method, path) 执行 UPSERT。

        冲突时累加 request_count / error_count，加权更新 avg_ms，取较大 p95_ms。
        """
        stmt = insert(ApiMetricsHourly).values(
            time_bucket=time_bucket,
            method=method,
            path=path,
            request_count=request_count,
            error_count=error_count,
            avg_ms=avg_ms,
            p95_ms=p95_ms,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["time_bucket", "method", "path"],
            set_={
                "request_count": text("api_metrics_hourly.request_count + EXCLUDED.request_count"),
                "error_count": text("api_metrics_hourly.error_count + EXCLUDED.error_count"),
                "avg_ms": text(
                    "CASE WHEN (api_metrics_hourly.request_count + EXCLUDED.request_count) > 0 "
                    "THEN (api_metrics_hourly.avg_ms * api_metrics_hourly.request_count "
                    "+ EXCLUDED.avg_ms * EXCLUDED.request_count) "
                    "/ (api_metrics_hourly.request_count + EXCLUDED.request_count) "
                    "ELSE 0 END"
                ),
                "p95_ms": text("GREATEST(api_metrics_hourly.p95_ms, EXCLUDED.p95_ms)"),
            },
        )
        await self.session.exec(stmt)  # type: ignore[arg-type]
        await self.session.commit()

    async def get_aggregated(
        self,
        start: datetime,
        end: datetime,
    ) -> list[ApiMetricsHourly]:
        """查询时间范围内按 (method, path) 分组的聚合数据。"""
        sum_req = func.sum(ApiMetricsHourly.request_count).label("request_count")
        sum_err = func.sum(ApiMetricsHourly.error_count).label("error_count")
        weighted_avg = case(
            (
                func.sum(ApiMetricsHourly.request_count) > 0,
                func.sum(ApiMetricsHourly.avg_ms * ApiMetricsHourly.request_count)
                / func.sum(ApiMetricsHourly.request_count),
            ),
            else_=0,
        ).label("avg_ms")
        max_p95 = func.max(ApiMetricsHourly.p95_ms).label("p95_ms")

        stmt = (
            sa_select(  # ty: ignore[no-matching-overload]
                ApiMetricsHourly.method,
                ApiMetricsHourly.path,
                sum_req,
                sum_err,
                weighted_avg,
                max_p95,
            )
            .where(col(ApiMetricsHourly.time_bucket) >= start)
            .where(col(ApiMetricsHourly.time_bucket) < end)
            .group_by(ApiMetricsHourly.method, ApiMetricsHourly.path)
        )
        result = await self.session.exec(stmt)  # ty: ignore[no-matching-overload]
        return list(result.all())

    async def get_trend(
        self,
        method: str,
        path: str,
        start: datetime,
        end: datetime,
    ) -> list[ApiMetricsHourly]:
        """查询单个端点的时间序列数据。"""
        stmt = (
            select(ApiMetricsHourly)
            .where(col(ApiMetricsHourly.method) == method)
            .where(col(ApiMetricsHourly.path) == path)
            .where(col(ApiMetricsHourly.time_bucket) >= start)
            .where(col(ApiMetricsHourly.time_bucket) < end)
            .order_by(col(ApiMetricsHourly.time_bucket))
        )
        result = await self.session.exec(stmt)
        return list(result.all())

    async def cleanup_old(self, days: int = 7) -> int:
        """删除超过 N 天的历史数据，返回删除条数。"""
        from src.utils.timezone import timezone

        cutoff = timezone.now() - timedelta(days=days)
        stmt = delete(ApiMetricsHourly).where(col(ApiMetricsHourly.time_bucket) < cutoff)
        result = await self.session.exec(stmt)  # type: ignore[arg-type]
        await self.session.commit()
        return result.rowcount  # type: ignore[union-attr]
