from datetime import date, datetime
from typing import Literal

from pydantic import Field, model_validator
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest


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


class ErrorStats(BaseModel):
    """错误统计。"""

    http_5xx_count: int
    biz_error_count: int
    total_requests: int
    error_rate: float
    sparkline_24h: list[float]


class HealthStats(BaseModel):
    audit_delivery: dict[str, int] = Field(default_factory=dict)
    """应用健康统计。"""

    qps: float
    p50_ms: float
    p95_ms: float
    http_5xx_1h: int
    biz_errors_1h: int
    ws_connections: int


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


class BusinessSummary(BaseModel):
    """业务数据汇总。"""

    roles: int
    menus: int
    routers: int
    schedules: int


class UserStatsSummary(BaseModel):
    """用户统计摘要。"""

    total: int
    today_new: int
    yesterday_new: int
    online_count: int


class UserActivityTrend(BaseModel):
    """用户活跃趋势。"""

    time_bucket: str
    new_users: int


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
    capacity_known: bool = False
    missing: int = 0
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
