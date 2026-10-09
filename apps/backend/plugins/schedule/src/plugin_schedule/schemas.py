"""
Schedule domain schemas.

Author  : Claude
Date    : 2026-04-01
"""

from datetime import datetime, timedelta
from typing import Annotated, Any, Literal

from celery.schedules import crontab
from pydantic import ConfigDict, Field, field_validator, model_validator
from rapidkit_common.schemas import BaseModel, BaseRequest
from rapidkit_common.schemas.request import PaginatedRequest
from rapidkit_common.schemas.response import BaseResponse, BaseSchema
from rapidkit_common.schemas.types import LocalDatetime

from plugin_schedule.schedule_types import Period, SolarEvent


class ScheduleDefinition(BaseResponse):
    model_config = ConfigDict(extra="forbid")


class IntervalDefinition(ScheduleDefinition):
    type: Literal["interval"]
    every: int = Field(ge=1, le=2147483647)
    period: Period

    @model_validator(mode="after")
    def validate_duration(self):
        try:
            timedelta(**{self.period.value: self.every})
        except OverflowError as exc:
            raise ValueError("Interval exceeds timedelta limits") from exc
        return self


class CrontabDefinition(ScheduleDefinition):
    type: Literal["crontab"]
    minute: str = Field("*", max_length=128)
    hour: str = Field("*", max_length=128)
    day_of_week: str = Field("*", max_length=128)
    day_of_month: str = Field("*", max_length=128)
    month_of_year: str = Field("*", max_length=128)


class SolarDefinition(ScheduleDefinition):
    type: Literal["solar"]
    event: SolarEvent
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


Schedule = Annotated[IntervalDefinition | CrontabDefinition | SolarDefinition, Field(discriminator="type")]


def validate_schedule(value: Schedule | None):
    if isinstance(value, CrontabDefinition):
        fields = value.model_dump(exclude={"type"})
        try:
            if any(not field.strip() for field in fields.values()):
                raise ValueError("Empty Cron field")
            crontab(**fields)
        except (KeyError, TypeError, ZeroDivisionError, ValueError) as exc:
            raise ValueError("Invalid Crontab expression") from exc
    return value


class SchedulePreviewRequest(BaseRequest):
    model_config = ConfigDict(extra="forbid")
    schedule: Schedule


class SchedulePreviewResponse(BaseResponse):
    valid: bool
    error_field: str | None = None
    timezone: str
    evaluated_at: datetime
    next_runs: list[datetime] = Field(default_factory=list)
    horizon_years: int = 5


class CrontabPreviewRequest(BaseRequest):
    minute: str = Field("*", max_length=128)
    hour: str = Field("*", max_length=128)
    day_of_week: str = Field("*", max_length=128)
    day_of_month: str = Field("*", max_length=128)
    month_of_year: str = Field("*", max_length=128)


class CrontabPreviewResponse(BaseResponse):
    valid: bool
    error_field: Literal["minute", "hour", "dayOfWeek", "dayOfMonth", "monthOfYear"] | None = None
    timezone: str
    evaluated_at: LocalDatetime
    next_runs: list[LocalDatetime] = Field(default_factory=list)
    horizon_years: int = 5


class PeriodicTaskCreate(BaseRequest):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., description="任务名称")
    task: str = Field(..., description="已注册的 Celery 任务名")
    schedule: Schedule
    enabled: bool = Field(True, description="是否启用")
    description: str = Field("", description="任务描述")
    args: list[Any] = Field(default=[], description="位置参数")
    kwargs: dict[str, Any] = Field(default={}, description="关键字参数")
    _validate_schedule = field_validator("schedule")(validate_schedule)


class PeriodicTaskUpdate(BaseRequest):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    task: str | None = None
    enabled: bool | None = None
    description: str | None = None
    args: list[Any] | None = None
    kwargs: dict[str, Any] | None = None
    schedule: Schedule | None = None
    _validate_schedule = field_validator("schedule")(validate_schedule)

    @model_validator(mode="after")
    def reject_explicit_null(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Omit unchanged fields instead of sending null")
        return self


class PeriodicTaskResponse(BaseSchema):
    name: str
    task: str
    enabled: bool
    description: str
    schedule: Schedule
    args: list[Any]
    kwargs: dict[str, Any]


class PeriodicTaskListResponse(BaseSchema):
    name: str
    task: str
    enabled: bool
    description: str
    schedule: Schedule


class PeriodicTaskQueriesSchema(BaseModel):
    enabled: bool | None = Field(None, description="启用状态筛选")
    task_name: str | None = Field(None, description="任务名筛选")


class PeriodicTaskQueryRequest(PeriodicTaskQueriesSchema, PaginatedRequest):
    pass
