"""
Celery scheduler.

Author  : Coke
Date    : 2025-04-10
"""

import asyncio
from abc import abstractmethod
from datetime import UTC, datetime, timedelta
from typing import Any, Coroutine, Sequence

from celery.beat import ScheduleEntry as _ScheduleEntry
from celery.beat import Scheduler as _Scheduler
from celery.utils.log import get_logger
from kombu import Producer
from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule
from plugin_schedule.schedule_types import TaskType
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.queues.celery import Celery

# TaskType.model 返回的是 models.py 的基类，select() 需要 SQLModel 表类
_SCHEDULE_MODEL_MAP: dict[TaskType, type[IntervalSchedule] | type[CrontabSchedule] | type[SolarSchedule]] = {
    TaskType.INTERVAL: IntervalSchedule,
    TaskType.CRONTAB: CrontabSchedule,
    TaskType.SOLAR: SolarSchedule,
}

logger = get_logger("celery.queues.scheduler")


class ScheduleEntry(_ScheduleEntry):
    """自定义调度条目。"""


class Scheduler(_Scheduler):
    """自定义调度器。"""

    Entry = ScheduleEntry
    refresh_interval: float
    last_updated: datetime

    def __init__(
        self,
        app: Celery,
        *,
        refresh_interval: bool | float = False,
        schedule: dict[str, ScheduleEntry] | None = None,
        max_interval: int | None = None,
        producer: type[Producer] | None = None,
        lazy: bool = False,
        sync_every_tasks: int | None = None,
        **kwargs: dict[str, Any],
    ) -> None:
        self._store: dict[str, ScheduleEntry] = {}
        super().__init__(
            app=app,
            schedule=schedule,
            max_interval=max_interval,
            Producer=producer,
            lazy=lazy,
            sync_every_tasks=sync_every_tasks,
            **kwargs,
        )
        self.refresh_interval = refresh_interval or self.app.conf.get("refresh_interval")
        logger.info("Synchronize database tasks every %s seconds.", self.refresh_interval)
        self.last_updated = datetime.now(UTC)

    @abstractmethod
    def get_database_schedule(self) -> dict[str, ScheduleEntry] | Coroutine[Any, Any, dict[str, ScheduleEntry]]:
        return {}

    def _database_schedule(self) -> dict[str, ScheduleEntry]:
        """
        获取并合并数据库与配置中的 Celery beat 调度任务。

        若数据库调度为异步协程，则自动等待。合并结果以配置中的 beat_schedule 为主，配置任务会覆盖数据库任务。

        Returns:
            合并后的调度任务字典
        """
        celery_beat = self.get_database_schedule()

        if asyncio.iscoroutine(celery_beat):
            loop = getattr(self, "_loop", None)
            if loop:
                celery_beat = loop.run_until_complete(celery_beat)
            else:
                celery_beat = asyncio.run(celery_beat)

        celery_beat.update(self.app.conf.beat_schedule)
        return celery_beat

    def setup_schedule(self) -> None:
        """
        合并数据库与配置任务，并安装默认调度条目。
        """
        schedule = self._database_schedule()
        self.merge_inplace(schedule)
        self.install_default_entries(self._store)

    def get_schedule(self) -> dict[str, ScheduleEntry]:
        """
        获取调度信息。
        """
        return self._store

    def set_schedule(self, schedule: dict[str, ScheduleEntry]) -> None:
        """
        设置调度信息。
        """
        self._store = schedule

    def sync(self) -> None:
        """
        同步内存中的调度数据到数据库。
        """
        # TODO: add sync database.
        super().sync()

    def close(self) -> None:
        """
        关闭调度器并清空已存储任务。
        """
        super().close()
        self._store.clear()

    schedule = property(get_schedule, set_schedule)

    def tick(self, *args: Any, **kwargs: Any) -> float:
        """
        每次心跳时调用，用于定期刷新周期性任务。

        若当前时间距离上次更新时间超过 refresh_interval 秒，则重新加载并合并数据库与配置中的调度任务。
        然后调用父类 tick 方法继续调度。

        Args:
            *args: 传递给父类 tick 的位置参数。
            **kwargs: 传递给父类 tick 的关键字参数。
        """

        now = datetime.now(UTC)
        # TODO: apscheduler ?
        if self.refresh_interval and (now - self.last_updated) > timedelta(seconds=self.refresh_interval):
            self.setup_schedule()
            self.last_updated = now

        return super().tick(*args, **kwargs)


class AsyncDatabaseScheduler(Scheduler):
    """异步数据库调度器。"""

    def __init__(self, app: Celery, **kwargs: Any) -> None:
        """
        初始化异步数据库调度器。
        """
        database_url = app.conf.get("database_url")
        if database_url is None:
            raise ValueError("Database URL must be configured.")
        self._loop = asyncio.new_event_loop()
        async_engine = create_async_engine(database_url)
        self.AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
        super().__init__(app, **kwargs)

    def close(self) -> None:
        super().close()
        if self._loop and not self._loop.is_closed():
            self._loop.close()

    async def get_database_schedule(self) -> dict[str, ScheduleEntry]:
        """
        从数据库中获取已启用的周期性任务，并以字典形式返回。

        Returns:
            周期性任务调度字典
        """
        async with self.AsyncSessionLocal() as session:
            _tasks = await session.exec(select(PeriodicTask).filter(col(PeriodicTask.enabled).is_(True)))
            tasks: Sequence[PeriodicTask] = _tasks.all()
            celery_beat = {}
            for task in tasks:
                schedule_model = _SCHEDULE_MODEL_MAP.get(task.task_type)
                if not schedule_model:
                    logger.warning("Unknown task type: %s for task %s", task.task_type, task.name)
                    continue
                _schedule_info = await session.exec(
                    select(schedule_model).filter(col(schedule_model.id) == task.schedule_id)
                )
                schedule_info = _schedule_info.first()
                if schedule_info:
                    celery_beat[task.name] = ScheduleEntry(
                        name=task.name,
                        task=task.task,
                        schedule=schedule_info.schedule,
                        args=task.args,
                        kwargs=task.kwargs,
                        options=task.options,
                    )

            logger.info("Database scheduled tasks(%d): %s", len(celery_beat), ", ".join(celery_beat.keys()))
            return celery_beat
