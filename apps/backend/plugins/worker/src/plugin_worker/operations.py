"""Operations dashboard data provided by the worker plugin."""

from datetime import datetime, timedelta
from typing import Awaitable, cast

from rapidkit_common.enums import TaskStatus, WorkerStatus
from rapidkit_common.protocols.operations import (
    DayComparison,
    QueueSnapshot,
    ServerSnapshot,
    TaskSuccessComparison,
    WorkerOperationsProvider,
)
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.redis_client import AsyncRedisClient
from sqlalchemy import case
from sqlmodel import col, func, select

from plugin_worker.models import CeleryTaskResult, CeleryWorker, QueueDepthSnapshot

HEARTBEAT_TIMEOUT_SECONDS = 60
QUEUE_SNAPSHOT_TOLERANCE = timedelta(minutes=10)
TERMINAL_STATUSES = (TaskStatus.SUCCESS, TaskStatus.FAILURE, TaskStatus.REVOKED)


def is_worker_healthy(status: WorkerStatus, last_heartbeat: datetime, now: datetime, timeout_seconds: int) -> bool:
    return status == WorkerStatus.ONLINE and last_heartbeat >= now - timedelta(seconds=timeout_seconds)


def terminal_success_rate(*, success: int, failure: int, revoked: int) -> float | None:
    total = success + failure + revoked
    return round(success / total * 100, 2) if total else None


class WorkerOperationsProviderImpl(WorkerOperationsProvider):
    def __init__(self, session_factory=AsyncSessionLocal, redis_factory=RedisManager.client):
        self._session_factory = session_factory
        self._redis_factory = redis_factory

    async def get_server_snapshot(self, now: datetime) -> ServerSnapshot:
        cutoff = now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
        async with self._session_factory() as session:
            statement = select(
                func.count(col(CeleryWorker.id)),
                func.count().filter(
                    col(CeleryWorker.status) == WorkerStatus.ONLINE,
                    col(CeleryWorker.last_heartbeat) >= cutoff,
                ),
            )
            total, healthy = (await session.exec(statement)).one()
        return ServerSnapshot(healthy=int(healthy or 0), total=int(total or 0))

    async def get_task_comparison(self, today_start: datetime, tomorrow_start: datetime) -> DayComparison:
        yesterday_start = today_start - timedelta(days=1)
        async with self._session_factory() as session:
            statement = select(
                func.count().filter(
                    col(CeleryTaskResult.started_at) >= today_start,
                    col(CeleryTaskResult.started_at) < tomorrow_start,
                ),
                func.count().filter(
                    col(CeleryTaskResult.started_at) >= yesterday_start,
                    col(CeleryTaskResult.started_at) < today_start,
                ),
            )
            today, yesterday = (await session.exec(statement)).one()
        return DayComparison(today=int(today or 0), yesterday=int(yesterday or 0))

    async def get_queue_snapshot(self, now: datetime) -> QueueSnapshot:
        target = now - timedelta(days=1)
        lower = target - QUEUE_SNAPSHOT_TOLERANCE
        upper = target + QUEUE_SNAPSHOT_TOLERANCE
        async with self._session_factory() as session:
            historical_statement = (
                select(QueueDepthSnapshot)
                .where(col(QueueDepthSnapshot.sampled_at) >= lower, col(QueueDepthSnapshot.sampled_at) <= upper)
                .order_by(func.abs(func.extract("epoch", col(QueueDepthSnapshot.sampled_at) - target)))
                .limit(1)
            )
            historical = (await session.exec(historical_statement)).first()
            workers = list((await session.exec(select(CeleryWorker))).all())
        queues = {"celery"}
        for worker in workers:
            queues.update(str(queue) for queue in (worker.active_queues or []))
        redis: AsyncRedisClient = self._redis_factory()
        current_depth = sum(int(await cast(Awaitable[int], redis.llen(queue)) or 0) for queue in queues)
        return QueueSnapshot(
            current_depth=current_depth,
            yesterday_depth=historical.depth if historical else None,
        )

    async def get_task_success_comparison(
        self,
        current_start: datetime,
        current_end: datetime,
        previous_start: datetime,
    ) -> TaskSuccessComparison:
        async with self._session_factory() as session:
            statement = select(
                func.count(case((col(CeleryTaskResult.status) == TaskStatus.SUCCESS, 1))).filter(
                    col(CeleryTaskResult.finished_at) >= current_start,
                    col(CeleryTaskResult.finished_at) < current_end,
                ),
                func.count().filter(
                    col(CeleryTaskResult.status).in_(TERMINAL_STATUSES),
                    col(CeleryTaskResult.finished_at) >= current_start,
                    col(CeleryTaskResult.finished_at) < current_end,
                ),
                func.count(case((col(CeleryTaskResult.status) == TaskStatus.SUCCESS, 1))).filter(
                    col(CeleryTaskResult.finished_at) >= previous_start,
                    col(CeleryTaskResult.finished_at) < current_start,
                ),
                func.count().filter(
                    col(CeleryTaskResult.status).in_(TERMINAL_STATUSES),
                    col(CeleryTaskResult.finished_at) >= previous_start,
                    col(CeleryTaskResult.finished_at) < current_start,
                ),
            )
            current_success, current_total, previous_success, previous_total = (await session.exec(statement)).one()
        return TaskSuccessComparison(
            current_rate=round(current_success / current_total * 100, 2) if current_total else None,
            previous_rate=round(previous_success / previous_total * 100, 2) if previous_total else None,
        )
