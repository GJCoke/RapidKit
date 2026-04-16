"""
Celery 调度 SQLModel 表定义。

Author : Coke
Date   : 2025-05-12
"""

from typing import Any

from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field

from plugin_schedule.schedule_types import CrontabSchedule as _CrontabSchedule
from plugin_schedule.schedule_types import IntervalSchedule as _IntervalSchedule
from plugin_schedule.schedule_types import Options
from plugin_schedule.schedule_types import PeriodicTask as _PeriodicTask
from plugin_schedule.schedule_types import SolarSchedule as _SolarSchedule


class IntervalSchedule(_IntervalSchedule, SQLModel, table=True):
    """Celery 间隔调度 SQLModel 模型。"""

    __tablename__ = "celery_interval_schedule"


class CrontabSchedule(_CrontabSchedule, SQLModel, table=True):
    """Celery Crontab 调度 SQLModel 模型。"""

    __tablename__ = "celery_crontab_schedule"


class SolarSchedule(_SolarSchedule, SQLModel, table=True):
    """Celery Solar 调度 SQLModel 模型。"""

    __tablename__ = "celery_solar_schedule"


class PeriodicTask(_PeriodicTask, SQLModel, table=True):
    """Celery 定时任务 SQLModel 模型。"""

    __tablename__ = "celery_periodic_task"

    args: list[Any] = Field([], sa_column=Column(JSON))
    kwargs: dict[str, Any] = Field({}, sa_column=Column(JSON))
    options: Options | None = Field(None, sa_column=Column(JSON))
