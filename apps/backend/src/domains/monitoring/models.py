"""
API 监控指标归档模型。

按小时粒度存储各 API 端点的请求统计数据。

Author : Coke
Date   : 2026-04-13
"""

from datetime import datetime

from sqlmodel import Field, Index

from src.common.models import SQLModel


class ApiMetricsHourly(SQLModel, table=True):
    """API 指标小时归档表。"""

    __tablename__ = "api_metrics_hourly"
    __table_args__ = (
        Index("idx_api_metrics_time", "time_bucket"),
        Index("idx_api_metrics_unique", "time_bucket", "method", "path", unique=True),
    )

    time_bucket: datetime = Field(nullable=False, description="小时粒度时间桶")
    method: str = Field(max_length=10, nullable=False, description="HTTP 方法")
    path: str = Field(max_length=255, nullable=False, description="归一化后的路径")
    request_count: int = Field(default=0, description="请求总数")
    error_count: int = Field(default=0, description="失败数（4xx+5xx）")
    avg_ms: float = Field(default=0, description="平均响应时间（ms）")
    p95_ms: float = Field(default=0, description="P95 响应时间（ms）")
