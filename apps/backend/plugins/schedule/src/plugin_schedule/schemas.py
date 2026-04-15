"""
Schedule domain schemas.

Author  : Claude
Date    : 2026-04-01
"""

from typing import Any
from uuid import UUID

from pydantic import Field

from rapidkit_common.schemas import BaseModel, BaseRequest
from rapidkit_common.schemas.request import PaginatedRequest
from rapidkit_common.schemas.response import BaseResponse, BaseSchema
from plugin_schedule.schedule_types import Period, TaskType


class IntervalScheduleCreate(BaseRequest):
    every: int = Field(..., ge=1, description="间隔数量")
    period: Period = Field(..., description="间隔周期单位")


class IntervalScheduleResponse(BaseResponse):
    every: int
    period: Period


class CrontabScheduleCreate(BaseRequest):
    minute: str = Field("*", description="分钟")
    hour: str = Field("*", description="小时")
    day_of_week: str = Field("*", description="星期")
    day_of_month: str = Field("*", description="日")
    month_of_year: str = Field("*", description="月")


class CrontabScheduleResponse(BaseResponse):
    minute: str
    hour: str
    day_of_week: str
    day_of_month: str
    month_of_year: str


class PeriodicTaskCreate(BaseRequest):
    name: str = Field(..., description="任务名称")
    task: str = Field(..., description="已注册的 Celery 任务名")
    task_type: TaskType = Field(..., description="调度类型")
    enabled: bool = Field(True, description="是否启用")
    description: str = Field("", description="任务描述")
    args: list[Any] = Field(default=[], description="位置参数")
    kwargs: dict[str, Any] = Field(default={}, description="关键字参数")
    interval: IntervalScheduleCreate | None = Field(None, description="间隔调度配置")
    crontab: CrontabScheduleCreate | None = Field(None, description="Crontab 调度配置")


class PeriodicTaskUpdate(BaseRequest):
    name: str | None = None
    task: str | None = None
    enabled: bool | None = None
    description: str | None = None
    args: list[Any] | None = None
    kwargs: dict[str, Any] | None = None
    interval: IntervalScheduleCreate | None = None
    crontab: CrontabScheduleCreate | None = None


class PeriodicTaskResponse(BaseSchema):
    name: str
    task: str
    task_type: TaskType
    enabled: bool
    description: str
    schedule_id: UUID
    args: list[Any]
    kwargs: dict[str, Any]
    interval: IntervalScheduleResponse | None = None
    crontab: CrontabScheduleResponse | None = None


class PeriodicTaskListResponse(BaseSchema):
    name: str
    task: str
    task_type: TaskType
    enabled: bool
    description: str
    schedule_id: UUID
    interval: IntervalScheduleResponse | None = None
    crontab: CrontabScheduleResponse | None = None


class PeriodicTaskQueriesSchema(BaseModel):
    enabled: bool | None = Field(None, description="启用状态筛选")
    task_name: str | None = Field(None, description="任务名筛选")


class PeriodicTaskQueryRequest(PeriodicTaskQueriesSchema, PaginatedRequest):
    pass
