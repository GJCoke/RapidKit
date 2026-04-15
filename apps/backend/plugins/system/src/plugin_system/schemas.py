"""
系统领域响应模型。

Author : Coke
Date   : 2026-04-10
"""

from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import LocalDatetime


class ActivityResponse(BaseSchema):
    """活动日志响应。"""

    event_type: str
    params: dict = {}
    detail: str | None = None
    source_ip: str | None = None


# ========== 系统资源 ==========


class ResourceStats(BaseModel):
    """服务器资源统计。"""

    cpu_percent: float
    memory_used: int
    memory_total: int
    memory_percent: float
    disk_used: int
    disk_total: int
    disk_percent: float
    net_sent: int
    net_recv: int


class InstanceResourceStats(ResourceStats):
    """单实例资源统计（带 hostname 标识）。"""

    hostname: str


class MultiResourceStats(BaseModel):
    """多实例资源统计汇总。"""

    instances: list[InstanceResourceStats]
    summary: InstanceResourceStats


# ========== 错误统计 ==========


class ErrorStats(BaseModel):
    """错误统计。"""

    http_5xx_count: int
    biz_error_count: int
    total_requests: int
    error_rate: float
    sparkline_24h: list[float]


# ========== 应用健康 ==========


class HealthStats(BaseModel):
    """应用健康统计。"""

    qps: float
    p50_ms: float
    p95_ms: float
    http_5xx_1h: int
    biz_errors_1h: int
    ws_connections: int


# ========== 基础设施 ==========


class ServiceHealth(BaseModel):
    """单个服务健康状态。"""

    status: str  # healthy / degraded / down
    latency_ms: float
    details: dict | None = None


class InfrastructureHealth(BaseModel):
    """基础设施健康状态。"""

    pg: ServiceHealth
    redis: ServiceHealth
    minio: ServiceHealth


# ========== 业务汇总 ==========


class BusinessSummary(BaseModel):
    """业务数据汇总。"""

    roles: int
    menus: int
    routers: int
    scripts: int
    schedules: int


# ========== 用户统计 ==========


class UserStatsSummary(BaseModel):
    """用户统计摘要。"""

    total: int
    today_new: int
    yesterday_new: int
    online_count: int


class UserActivityTrend(BaseModel):
    """用户活跃趋势。"""

    time_bucket: LocalDatetime
    new_users: int
