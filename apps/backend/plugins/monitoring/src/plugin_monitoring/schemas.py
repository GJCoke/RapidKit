"""
API 监控 Schema 定义。

Author : Coke
Date   : 2026-04-13
"""

from pydantic import Field

from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest
from rapidkit_common.schemas.types import LocalDatetime


class ApiOverviewResponse(BaseModel):
    """API 监控概览。"""

    total_requests: int = Field(0, description="总请求数")
    total_errors: int = Field(0, description="总失败数")
    avg_error_rate: float = Field(0, description="平均错误率(%)")
    avg_ms: float = Field(0, description="平均响应时间(ms)")
    busiest_path: str | None = Field(None, description="最忙接口路径")
    busiest_method: str | None = Field(None, description="最忙接口方法")
    busiest_count: int = Field(0, description="最忙接口请求数")


class ApiTopItem(BaseModel):
    """API 排行条目。"""

    path: str
    method: str
    request_count: int = 0
    error_count: int = 0
    error_rate: float = 0
    avg_ms: float = 0
    p95_ms: float = 0


class ApiDistributionItem(BaseModel):
    """API 请求占比分布条目。"""

    path: str
    method: str
    request_count: int = 0
    percentage: float = 0


class ApiTrendPoint(BaseModel):
    """API 趋势数据点。"""

    time_bucket: LocalDatetime
    request_count: int = 0
    error_count: int = 0


class ApiListItem(BaseModel):
    """API 明细列表条目。"""

    path: str
    method: str
    request_count: int = 0
    error_count: int = 0
    error_rate: float = 0
    avg_ms: float = 0
    p95_ms: float = 0


class TimeRangeQuery(BaseRequest):
    """时间范围查询参数。"""

    range: str = Field("24h", description="时间范围: 1h / 6h / 24h / 7d")
    start: str | None = Field(None, description="自定义开始时间")
    end: str | None = Field(None, description="自定义结束时间")


class ApiTopQuery(TimeRangeQuery):
    """API Top N 查询参数。"""

    sort_by: str = Field("requests", description="排序字段: requests/errors/avg_ms/p95_ms")
    limit: int = Field(10, ge=1, le=50, description="返回条数")


class ApiListQuery(TimeRangeQuery, PaginatedRequest):
    """API 明细列表查询参数。"""

    keyword: str | None = Field(None, description="模糊搜索路径")
    sort_by: str = Field("request_count", description="排序字段")
    sort_order: str = Field("desc", description="排序方向")
