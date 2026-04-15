"""
Worker domain CRUD operations.

Author  : Claude
Date    : 2026-03-30
"""

from datetime import date, datetime, timedelta

from rapidkit_common.crud import BaseSQLModelCRUD
from rapidkit_common.enums import TaskStatus, WorkerStatus
from rapidkit_common.schemas.response import PaginatedResponse
from rapidkit_core.timezone import timezone
from sqlalchemy import case
from sqlalchemy import select as sa_select
from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_worker.models import CeleryTaskResult, CeleryWorker
from plugin_worker.schemas import (
    TaskListResponse,
    TaskQueryRequest,
    TaskResultCreate,
    TaskResultUpdate,
    TaskStatsByName,
    TaskStatsByWorker,
    TaskStatsSummary,
    TaskStatsTimeline,
    WorkerCreate,
    WorkerQueryRequest,
    WorkerResponse,
    WorkerUpdate,
)


class WorkerCRUD(BaseSQLModelCRUD[CeleryWorker, WorkerCreate, WorkerUpdate]):
    """Celery Worker CRUD 操作。"""

    async def get_by_hostname(self, hostname: str, *, session: AsyncSession | None = None) -> CeleryWorker | None:
        session = session or self.session
        statement = select(self.model).filter(col(self.model.hostname) == hostname)
        result = await session.exec(statement)
        return result.first()

    async def get_paginate_workers(
        self, query: WorkerQueryRequest, *, session: AsyncSession | None = None
    ) -> PaginatedResponse[WorkerResponse]:
        filters = []
        if query.status is not None:
            filters.append(col(self.model.status) == query.status)
        if query.hostname:
            filters.append(col(self.model.hostname).contains(query.hostname))
        return await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=col(self.model.last_heartbeat).desc(),
            session=session,
            serializer=WorkerResponse,
        )

    async def get_all_workers(self, *, session: AsyncSession | None = None) -> list[WorkerResponse]:
        return await self.get_all(
            order_by=col(self.model.last_heartbeat).desc(),
            session=session,
            serializer=WorkerResponse,
        )

    async def get_offline_workers(self, threshold: float, *, session: AsyncSession | None = None) -> list[CeleryWorker]:
        session = session or self.session
        cutoff = timezone.now() - timedelta(seconds=threshold)
        statement = select(self.model).filter(
            col(self.model.status) == WorkerStatus.ONLINE,
            col(self.model.last_heartbeat) < cutoff,
        )
        result = await session.exec(statement)
        return list(result.all())

    async def upsert_by_hostname(
        self, hostname: str, defaults: dict, *, session: AsyncSession | None = None
    ) -> CeleryWorker:
        session = session or self.session
        statement = select(self.model).filter(col(self.model.hostname) == hostname).with_for_update()
        result = await session.exec(statement)
        worker = result.first()
        if worker:
            for key, value in defaults.items():
                setattr(worker, key, value)
        else:
            worker = self.model(hostname=hostname, **defaults)
            session.add(worker)
        return worker


class TaskResultCRUD(BaseSQLModelCRUD[CeleryTaskResult, TaskResultCreate, TaskResultUpdate]):
    """Celery Task Result CRUD 操作。"""

    async def get_by_task_id(self, task_id: str, *, session: AsyncSession | None = None) -> CeleryTaskResult | None:
        session = session or self.session
        statement = select(self.model).filter(col(self.model.task_id) == task_id)
        result = await session.exec(statement)
        return result.first()

    async def upsert_by_task_id(
        self, task_id: str, defaults: dict, *, session: AsyncSession | None = None
    ) -> CeleryTaskResult:
        session = session or self.session
        statement = select(self.model).filter(col(self.model.task_id) == task_id).with_for_update()
        result = await session.exec(statement)
        task = result.first()
        if task:
            for key, value in defaults.items():
                setattr(task, key, value)
        else:
            task = self.model(task_id=task_id, **defaults)
            session.add(task)
        return task

    async def get_paginate_tasks(
        self, query: TaskQueryRequest, *, session: AsyncSession | None = None
    ) -> PaginatedResponse[TaskListResponse]:
        filters = []
        if query.status is not None:
            filters.append(col(self.model.status) == query.status)
        if query.task_name:
            filters.append(col(self.model.task_name).contains(query.task_name))
        if query.worker_hostname:
            filters.append(col(self.model.worker_hostname).contains(query.worker_hostname))
        return await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=col(self.model.create_time).desc(),
            session=session,
            serializer=TaskListResponse,
        )

    def _time_filter(self, days: int):
        cutoff = timezone.now() - timedelta(days=days)
        return col(self.model.create_time) >= cutoff

    async def get_stats_summary(self, days: int, *, session: AsyncSession | None = None) -> TaskStatsSummary:
        session = session or self.session
        statement = sa_select(
            func.count().label("total"),
            func.count(case((col(self.model.status) == TaskStatus.SUCCESS, 1))).label("success"),
            func.count(case((col(self.model.status) == TaskStatus.FAILURE, 1))).label("failure"),
            func.count(case((col(self.model.status) == TaskStatus.RETRY, 1))).label("retry"),
            func.count(case((col(self.model.status) == TaskStatus.REVOKED, 1))).label("revoked"),
            func.avg(case((col(self.model.status) == TaskStatus.SUCCESS, col(self.model.runtime)))).label(
                "avg_runtime"
            ),
        ).filter(self._time_filter(days))
        result = (await session.exec(statement)).mappings().one()  # type: ignore[union-attr]  # ty: ignore[no-matching-overload]
        total = result["total"] or 0
        success = result["success"] or 0
        return TaskStatsSummary(
            total=total,
            success=success,
            failure=result["failure"] or 0,
            retry=result["retry"] or 0,
            revoked=result["revoked"] or 0,
            success_rate=round(success / total * 100, 2) if total > 0 else 0.0,
            avg_runtime=round(result["avg_runtime"], 3) if result["avg_runtime"] is not None else None,
        )

    async def get_stats_timeline(
        self,
        days: int,
        *,
        start: date | None = None,
        end: date | None = None,
        granularity: str = "hour",
        session: AsyncSession | None = None,
    ) -> list[TaskStatsTimeline]:
        session = session or self.session
        trunc_unit = "hour" if granularity == "hour" else "day"
        bucket = func.date_trunc(trunc_unit, col(self.model.create_time)).label("time_bucket")
        statement = select(
            bucket,
            func.count().label("total"),
            func.count(case((col(self.model.status) == TaskStatus.SUCCESS, 1))).label("success"),
            func.count(case((col(self.model.status) == TaskStatus.FAILURE, 1))).label("failure"),
        )
        if start and end:
            start_dt = datetime.combine(start, datetime.min.time())
            end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time())
            statement = statement.filter(
                col(self.model.create_time) >= start_dt,
                col(self.model.create_time) < end_dt,
            )
        else:
            statement = statement.filter(self._time_filter(days))
        statement = statement.group_by(bucket).order_by(bucket)
        results = (await session.exec(statement)).mappings().all()  # type: ignore[union-attr]  # ty: ignore[unresolved-attribute]
        return [
            TaskStatsTimeline(
                time_bucket=row["time_bucket"],
                total=row["total"],
                success=row["success"],
                failure=row["failure"],
            )
            for row in results
        ]

    async def get_stats_by_name(
        self, days: int, *, limit: int = 10, session: AsyncSession | None = None
    ) -> list[TaskStatsByName]:
        session = session or self.session
        total_col = func.count().label("total")
        statement = (
            sa_select(
                col(self.model.task_name),
                total_col,
                func.count(case((col(self.model.status) == TaskStatus.SUCCESS, 1))).label("success"),
                func.count(case((col(self.model.status) == TaskStatus.FAILURE, 1))).label("failure"),
                func.avg(case((col(self.model.status) == TaskStatus.SUCCESS, col(self.model.runtime)))).label(
                    "avg_runtime"
                ),
            )
            .filter(self._time_filter(days))
            .group_by(col(self.model.task_name))
            .order_by(total_col.desc())
            .limit(limit)
        )
        results = (await session.exec(statement)).all()  # type: ignore[call-overload]  # ty: ignore[no-matching-overload]
        return [
            TaskStatsByName(
                task_name=row.task_name,
                total=row.total,
                success=row.success,
                failure=row.failure,
                avg_runtime=round(row.avg_runtime, 3) if row.avg_runtime is not None else None,
            )
            for row in results
        ]

    async def get_stats_by_worker(self, days: int, *, session: AsyncSession | None = None) -> list[TaskStatsByWorker]:
        session = session or self.session
        statement = (
            sa_select(
                col(self.model.worker_hostname),
                func.count().label("total"),
                func.count(case((col(self.model.status) == TaskStatus.SUCCESS, 1))).label("success"),
                func.count(case((col(self.model.status) == TaskStatus.FAILURE, 1))).label("failure"),
                func.avg(case((col(self.model.status) == TaskStatus.SUCCESS, col(self.model.runtime)))).label(
                    "avg_runtime"
                ),
            )
            .filter(self._time_filter(days), col(self.model.worker_hostname) != "")
            .group_by(col(self.model.worker_hostname))
            .order_by(func.count().desc())
        )
        results = (await session.exec(statement)).all()  # type: ignore[call-overload]  # ty: ignore[no-matching-overload]
        return [
            TaskStatsByWorker(
                worker_hostname=row.worker_hostname,
                total=row.total,
                success=row.success,
                failure=row.failure,
                avg_runtime=round(row.avg_runtime, 3) if row.avg_runtime is not None else None,
            )
            for row in results
        ]
