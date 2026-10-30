"""
Celery scheduler.

Author  : Coke
Date    : 2025-04-10
"""

import asyncio
from abc import abstractmethod
from datetime import datetime, timedelta
from threading import Event, Thread
from typing import Any, Coroutine, Sequence

from celery.beat import ScheduleEntry as _ScheduleEntry
from celery.beat import Scheduler as _Scheduler
from celery.schedules import crontab
from kombu import Producer
from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule
from plugin_schedule.schedule_types import TaskType
from rapidkit_core.config import settings
from rapidkit_core.leader_election import LeaderElection
from rapidkit_core.log import logger
from rapidkit_core.timezone import timezone
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.queues.celery import Celery

# TaskType.model 返回的是 models.py 的基类，select() 需要 SQLModel 表类
_SCHEDULE_MODEL_MAP: dict[TaskType, type[IntervalSchedule] | type[CrontabSchedule] | type[SolarSchedule]] = {
    TaskType.INTERVAL: IntervalSchedule,
    TaskType.CRONTAB: CrontabSchedule,
    TaskType.SOLAR: SolarSchedule,
}


class ScheduleEntry(_ScheduleEntry):
    """自定义调度条目。"""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if isinstance(self.schedule, crontab):
            # Celery reads calendar fields without converting an aware UTC baseline.
            self.last_run_at = self.schedule.maybe_make_aware(self.last_run_at).astimezone(self.schedule.tz)


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
        logger.info("Synchronize database tasks every {interval} seconds.", interval=self.refresh_interval)
        self.last_updated = timezone.now()

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
            if loop and loop.is_running():
                celery_beat = asyncio.run_coroutine_threadsafe(celery_beat, loop).result()
            elif loop:
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
        # merge_inplace mutates entries shared with Celery's shallow snapshot.
        # Its equality check cannot detect those changes, leaving heap timestamps
        # in the old order. Rebuild the heap while preserving last_run_at/count.
        self._heap = None

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

        now = timezone.now()
        # TODO: apscheduler ?
        if self.refresh_interval and (now - self.last_updated) >= timedelta(seconds=self.refresh_interval):
            self.setup_schedule()
            self.last_updated = timezone.now()

        delay = super().tick(*args, **kwargs)
        if self.refresh_interval:
            # Even an empty/daily schedule must poll for database changes on time.
            until_refresh = self.refresh_interval - (timezone.now() - self.last_updated).total_seconds()
            return min(delay, max(0.0, until_refresh))
        return delay


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
        self._thread: Thread | None = None
        self._leader: LeaderElection | None = None
        self._engine: AsyncEngine | None = None
        self._redis: Redis | None = None
        self._database_url = database_url
        self._was_leader = False
        self._closed = False
        try:
            if not kwargs.get("lazy", False):
                self._start_runtime()
            super().__init__(app, **kwargs)
        except BaseException:
            self._close_runtime()
            raise

    def _start_runtime(self) -> None:
        if self._thread is not None:
            return
        if self._closed:
            raise RuntimeError("Scheduler is closed")
        ready = Event()

        def run_loop() -> None:
            asyncio.set_event_loop(self._loop)
            self._loop.call_soon(ready.set)
            self._loop.run_forever()

        self._thread = Thread(target=run_loop, name="rapidkit-beat-loop", daemon=True)
        self._thread.start()
        if not ready.wait(5):
            raise RuntimeError("Scheduler event loop did not start")
        self._run(self._initialize())

    def _run(self, coroutine: Coroutine[Any, Any, Any]) -> Any:
        return asyncio.run_coroutine_threadsafe(coroutine, self._loop).result()

    async def _initialize(self) -> None:
        # All loop-bound resources are created and closed on this continuously running loop.
        self._engine = create_async_engine(self._database_url)
        self.AsyncSessionLocal = async_sessionmaker(self._engine, class_=AsyncSession, expire_on_commit=False)
        self._redis = Redis.from_url(str(settings.REDIS_URL))
        self._leader = LeaderElection(self._redis, "leader:celery-beat", ttl=15, renew_interval=5.0)
        await self._leader.start()

    async def _read_leadership(self) -> bool:
        return self._leader is not None and self._leader.is_leader

    def _has_leadership(self) -> bool:
        if self._closed:
            return False
        self._start_runtime()
        return self._run(self._read_leadership())

    def setup_schedule(self) -> None:
        if self._has_leadership():
            super().setup_schedule()

    def tick(self, *args: Any, **kwargs: Any) -> float:
        if not self._has_leadership():
            if self._was_leader:
                logger.info("Database beat leadership lost.")
            self._was_leader = False
            return 5.0
        if not self._was_leader:
            logger.info("Database beat leadership acquired; timezone={timezone}.", timezone=self.app.conf.timezone)
            self.setup_schedule()
            self.last_updated = timezone.now()
            self._was_leader = True
        return super().tick(*args, **kwargs)

    def apply_entry(self, entry: ScheduleEntry, producer: Producer | None = None) -> None:
        if self._has_leadership():
            super().apply_entry(entry, producer=producer)
        else:
            self._was_leader = False

    async def _shutdown(self) -> None:
        try:
            if self._leader is not None:
                await self._leader.stop()
        finally:
            try:
                if self._redis is not None:
                    await self._redis.aclose()
            finally:
                if self._engine is not None:
                    await self._engine.dispose()

    def _close_runtime(self) -> None:
        try:
            if self._loop.is_running():
                self._run(self._shutdown())
        finally:
            if self._thread is not None:
                self._loop.call_soon_threadsafe(self._loop.stop)
                self._thread.join()
            if not self._loop.is_closed():
                self._loop.close()
            self._closed = True

    def close(self) -> None:
        if self._closed:
            return
        try:
            super().close()
        finally:
            self._close_runtime()

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
                    logger.warning(
                        "Unknown task type: {task_type} for task {task_name}",
                        task_type=task.task_type,
                        task_name=task.name,
                    )
                    continue
                _schedule_info = await session.exec(
                    select(schedule_model).filter(col(schedule_model.id) == task.schedule_id)
                )
                schedule_info = _schedule_info.first()
                if schedule_info:
                    celery_beat[task.name] = ScheduleEntry(
                        app=self.app,
                        name=task.name,
                        task=task.task,
                        schedule=schedule_info.schedule,
                        args=task.args,
                        kwargs=task.kwargs,
                        options=task.options,
                    )
                    logger.debug(
                        "Loaded schedule {name}: timezone={timezone}, last_run_at={last_run_at}",
                        name=task.name,
                        timezone=self.app.conf.timezone,
                        last_run_at=celery_beat[task.name].last_run_at.isoformat(),
                    )

            logger.info(
                "Database scheduled tasks({count}): {tasks}",
                count=len(celery_beat),
                tasks=", ".join(celery_beat.keys()),
            )
            return celery_beat
