"""
Celery Periodic Task Models.

Author  : Coke
Date    : 2025-04-10
"""

from abc import abstractmethod
from datetime import timedelta
from enum import Enum
from typing import Any
from uuid import UUID

from celery.schedules import crontab as Crontab
from celery.schedules import schedule as Schedule
from celery.schedules import solar as Solar
from pydantic import BaseModel


class Period(Enum):
    """datetime.timedelta 的参数枚举。"""

    WEEKS = "weeks"
    DAYS = "days"
    HOURS = "hours"
    MINUTES = "minutes"
    SECONDS = "seconds"
    MILLISECONDS = "milliseconds"
    MICROSECONDS = "microseconds"


class SolarEvent(Enum):
    """Celery 调度的天文事件枚举。"""

    DAWN_ASTRONOMICAL = "dawn_astronomical"
    DAWN_NAUTICAL = "dawn_nautical"
    DAWN_CIVIL = "dawn_civil"
    SUNRISE = "sunrise"
    SOLAR_NOON = "solar_noon"
    SUNSET = "sunset"
    DUSK_CIVIL = "dusk_civil"
    DUSK_NAUTICAL = "dusk_nautical"
    DUSK_ASTRONOMICAL = "dusk_astronomical"


class BaseSchedule:
    """
    调度基类模型。

    为提升 VSCode、PyCharm 等 IDE 的类型推断，继承 Scheduler 的自定义调度类应显式实现 schedule 属性。
    """

    id: Any

    @property
    @abstractmethod
    def schedule(self) -> Any: ...


class IntervalSchedule(BaseSchedule):
    """Celery 间隔调度模型。"""

    every: int
    period: Period

    @property
    def schedule(self) -> Schedule:
        """
        获取调度计划。

        Returns:
            调度对象
        """
        return Schedule(
            timedelta(**{self.period.value: self.every}),
        )


class CrontabSchedule(BaseSchedule):
    """Celery Crontab 调度模型。"""

    minute: str = "*"
    hour: str = "*"
    day_of_week: str = "*"
    day_of_month: str = "*"
    month_of_year: str = "*"

    @property
    def schedule(self) -> Crontab:
        """
        获取 crontab 调度计划。

        Returns:
            crontab 调度对象
        """
        return Crontab(
            minute=self.minute,
            hour=self.hour,
            day_of_week=self.day_of_week,
            day_of_month=self.day_of_month,
            month_of_year=self.month_of_year,
        )


class SolarSchedule(BaseSchedule):
    """Celery 天文调度模型。"""

    event: SolarEvent
    latitude: int
    longitude: int

    @property
    def schedule(self) -> Solar:
        """
        获取天文调度计划。

        Returns:
            天文调度对象
        """
        return Solar(
            event=self.event.value,
            lat=self.latitude,
            lon=self.longitude,
        )


class TaskType(Enum):
    """Celery 定时任务类型枚举。"""

    INTERVAL = ("interval", IntervalSchedule)
    CRONTAB = ("crontab", CrontabSchedule)
    SOLAR = ("solar", SolarSchedule)

    def __init__(self, value: str, model: type[BaseSchedule]):
        self._value_ = value
        self._model_ = model

    @property
    def model(self) -> type[BaseSchedule]:
        return self._model_


class RetryPolicy(BaseModel):
    """
    任务重试策略，基于 Celery 的 retry 配置。

    等价于 Celery beat 的 retry_policy 选项：
        app = Celery("celery_app", broker=REDIS_URL, backend=REDIS_URL)
        app.conf.update({
            "beat_schedule": {
                "test_beat_task": {
                    "task": "src.queues.tasks.tasks.test_celery",
                    "schedule": 10,
                    "options": {
                        "retry_policy": `RetryPolicy`
                    }
                }
            }
        })
    """

    max_retries: int | None = None
    interval_start: int | None = None
    interval_step: int | None = None
    interval_max: int | None = None


class Options(BaseModel):
    """
    Celery 任务调度选项，类似于 Celery beat 的 options。

    等价于 Celery beat 的 options：
        app = Celery("celery_app", broker=REDIS_URL, backend=REDIS_URL)
        app.conf.update({
            "beat_schedule": {
                "test_beat_task": {
                    "task": "src.queues.tasks.tasks.test_celery",
                    "schedule": 10,
                    "options": `Options`
                }
            }
        })
    """

    queue: str | None = None
    priority: int | None = None
    retry: bool = False
    expires: int | None = None
    task_id: str | None = None
    retry_policy: RetryPolicy


class PeriodicTask:
    """
    Celery 定时任务模型。
    """

    name: str
    enabled: bool = True
    description: str = "任务描述"

    task: str
    task_type: TaskType
    schedule_id: UUID
    args: list[Any] | None
    kwargs: dict[str, Any] | None
    options: Options | None
