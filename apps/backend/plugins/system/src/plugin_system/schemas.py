"""
系统领域响应模型。

Author : Coke
Date   : 2026-04-10
"""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import LocalDatetime

from plugin_system.models import (
    ActivityCategory,
    ActivityEvent,
    ActivityLevel,
    AuditResult,
    AuditRiskLevel,
    AuditSource,
)


class ActivityResponse(BaseSchema):
    """Curated activity response without audit diagnostics."""

    category: ActivityCategory
    event_code: str
    level: ActivityLevel
    actor_id: UUID | None = None
    actor_name: str | None = None
    subject_type: str
    subject_id: str | None = None
    subject_name: str | None = None
    title_key: str
    title_params: dict = Field(default_factory=dict)
    description_key: str | None = None
    description_params: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    occurred_at: LocalDatetime

    @classmethod
    def from_record(cls, record: ActivityEvent) -> "ActivityResponse":
        data = record.model_dump(exclude={"extra_data"})
        return cls.model_validate({**data, "metadata": record.extra_data})


class ActivityCursorQuery(BaseRequest):
    categories: list[ActivityCategory] | None = None
    levels: list[ActivityLevel] | None = None
    cursor: UUID | None = None
    size: int = Field(default=20, ge=1, le=100)


class AuditLogQuery(PaginatedRequest):
    action: str | None = None
    result: AuditResult | None = None
    actor_id: UUID | None = None


class AuditLogListItem(BaseSchema):
    actor_id: UUID | None = None
    actor_name: str | None = None
    action: str
    resource_type: str | None = None
    resource_name: str | None = None
    result: AuditResult
    risk_level: AuditRiskLevel
    source: AuditSource
    ip: str | None = None
    occurred_at: LocalDatetime


class AuditLogDetail(AuditLogListItem):
    request_id: str | None = None
    correlation_id: str | None = None
    user_agent: str | None = None
    http_method: str | None = None
    path: str | None = None
    request_summary: dict | None = None
    response_code: int | None = None
    error_message: str | None = None


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


# ========== 聚合健康 ==========


class AggregatedHealth(BaseModel):
    """聚合健康状态响应（仅基础设施）。"""

    status: str  # healthy / degraded / unhealthy
    infrastructure: InfrastructureHealth


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


# ========== 插件状态 ==========


class PluginErrorResponse(BaseModel):
    """插件加载错误。"""

    phase: str
    message: str
    caused_by: str | None = None


class PluginStatusItem(BaseModel):
    """单个插件的状态信息。"""

    name: str
    version: str | None = None
    status: str  # loaded / disabled / failed / degraded
    required: bool | None = None
    dependencies: list[str] | None = None
    load_time_ms: float | None = None
    startup_time_ms: float | None = None
    error: PluginErrorResponse | None = None


# ========== EventBus 可观测性 ==========


class DeadLetterResponse(BaseModel):
    """死信事件记录。"""

    event_name: str
    timestamp: str
    source: str | None = None


class EventBusStats(BaseModel):
    """EventBus 统计信息。"""

    handler_errors: dict[str, int]
    dead_letters: list[DeadLetterResponse]
    dead_letter_count: int


# ========== 插件依赖图 ==========


class PluginNode(BaseModel):
    """依赖图中的插件节点。"""

    name: str
    version: str | None = None
    status: str  # loaded / disabled / failed
    required: bool = True


class PluginEdge(BaseModel):
    """依赖图中的边（source 依赖 target）。"""

    source: str
    target: str


class PluginDependencyGraph(BaseModel):
    """插件依赖关系图。"""

    nodes: list[PluginNode]
    edges: list[PluginEdge]


class OperationsOverviewQuery(BaseRequest):
    range: Literal["7d", "30d", "custom"] = "7d"
    start: date | None = None
    end: date | None = None

    @model_validator(mode="after")
    def validate_custom_range(self) -> "OperationsOverviewQuery":
        if self.range == "custom" and (self.start is None or self.end is None):
            raise ValueError("start and end are required for a custom range")
        if self.start is not None and self.end is not None and self.start > self.end:
            raise ValueError("start must not be after end")
        return self


class OperationsServerSummary(BaseModel):
    healthy: int
    total: int
    status: Literal["healthy", "degraded", "down"]


class OperationsDayComparison(BaseModel):
    today: int
    yesterday: int
    change_percent: float | None


class OperationsErrorComparison(BaseModel):
    today: float | None
    yesterday: float | None
    change_points: float | None


class OperationsSummary(BaseModel):
    servers: OperationsServerSummary | None
    active_users: OperationsDayComparison | None
    tasks: OperationsDayComparison | None
    api_error_rate: OperationsErrorComparison | None


class OperationsTrendPoint(BaseModel):
    date: str
    request_count: int
    avg_response_ms: float | None


class OperationsSystemSummary(BaseModel):
    started_at: datetime
    uptime_seconds: int
    queue_depth: int | None
    queue_depth_yesterday: int | None
    queue_depth_change_percent: float | None
    last_sync_at: datetime | None
    sync_status: Literal["healthy", "delayed", "failed", "unavailable"]
    task_success_rate_7d: float | None
    previous_task_success_rate_7d: float | None
    task_success_rate_change_points: float | None


class OperationsOverviewResponse(BaseModel):
    generated_at: datetime
    timezone: str
    summary: OperationsSummary
    trend: list[OperationsTrendPoint]
    system: OperationsSystemSummary
