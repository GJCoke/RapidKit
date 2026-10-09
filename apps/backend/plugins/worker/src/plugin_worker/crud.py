"""
Worker domain CRUD operations.

Author  : Claude
Date    : 2026-03-30
"""

from datetime import date, datetime, timedelta

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.enums import TaskStatus, WorkerStatus
from rapidkit_common.schemas.response import PaginatedResponse
from rapidkit_core.timezone import timezone
from sqlalchemy import select as sa_select
from sqlmodel import case, col, func, select

from plugin_worker.inventory import scoped_worker_filters
from plugin_worker.models import CeleryTaskResult, CeleryWorker
from plugin_worker.schemas import (
    TaskGroupQuery,
    TaskListResponse,
    TaskQueryRequest,
    TaskStatsByName,
    TaskStatsByWorker,
    TaskStatsSummary,
    TaskStatsTimeline,
    WorkerQueryRequest,
    WorkerResponse,
)


class WorkerCRUD(BaseCRUD[CeleryWorker]):
    """Celery Worker CRUD 操作。"""

    model = CeleryWorker

    async def get_by_hostname(self, hostname: str) -> CeleryWorker | None:
        statement = select(self.model).filter(col(self.model.hostname) == hostname)
        result = await self.session.exec(statement)
        return result.first()

    async def get_paginate_workers(self, query: WorkerQueryRequest) -> PaginatedResponse[WorkerResponse]:
        filters = scoped_worker_filters()
        if query.status is not None:
            filters.append(col(self.model.status) == query.status)
        if query.hostname:
            filters.append(col(self.model.hostname).contains(query.hostname))
        return await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=col(self.model.last_heartbeat).desc(),
            schema=WorkerResponse,
        )

    async def get_all_workers(self) -> list[WorkerResponse]:
        return await self.get_all(
            *scoped_worker_filters(),
            order_by=col(self.model.last_heartbeat).desc(),
            schema=WorkerResponse,
        )

    async def get_offline_workers(self, threshold: float) -> list[CeleryWorker]:
        cutoff = timezone.now() - timedelta(seconds=threshold)
        statement = select(self.model).filter(
            *scoped_worker_filters(),
            col(self.model.status) == WorkerStatus.ONLINE,
            col(self.model.last_heartbeat) < cutoff,
        )
        result = await self.session.exec(statement)
        return list(result.all())

    async def upsert_by_hostname(self, hostname: str, defaults: dict) -> CeleryWorker:
        statement = select(self.model).filter(col(self.model.hostname) == hostname).with_for_update()
        result = await self.session.exec(statement)
        worker = result.first()
        if worker:
            for key, value in defaults.items():
                setattr(worker, key, value)
        else:
            worker = self.model(hostname=hostname, **defaults)
            self.session.add(worker)
        return worker


class TaskResultCRUD(BaseCRUD[CeleryTaskResult]):
    """Celery Task Result CRUD 操作。"""

    model = CeleryTaskResult

    async def get_by_task_id(self, task_id: str) -> CeleryTaskResult | None:
        statement = select(self.model).filter(col(self.model.task_id) == task_id)
        result = await self.session.exec(statement)
        return result.first()

    async def upsert_by_task_id(self, task_id: str, defaults: dict) -> CeleryTaskResult:
        statement = select(self.model).filter(col(self.model.task_id) == task_id).with_for_update()
        result = await self.session.exec(statement)
        task = result.first()
        if task:
            for key, value in defaults.items():
                setattr(task, key, value)
        else:
            task = self.model(task_id=task_id, **defaults)
            self.session.add(task)
        return task

    async def get_paginate_tasks(self, query: TaskQueryRequest) -> PaginatedResponse[TaskListResponse]:
        filters = self._task_filters(query)
        if query.status is not None:
            filters.append(col(self.model.status) == query.status)
        return await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=col(self.model.create_time).desc(),
            schema=TaskListResponse,
        )

    def _task_filters(self, query: TaskQueryRequest | TaskGroupQuery):
        filters = [
            col(self.model.create_time) >= query.start_time,
            col(self.model.create_time) < query.end_time,
        ]
        if query.task_name:
            if isinstance(query, TaskQueryRequest) and query.task_name_match == "exact":
                filters.append(col(self.model.task_name) == query.task_name)
            else:
                filters.append(col(self.model.task_name).contains(query.task_name, autoescape=True))
        if query.worker_hostname:
            filters.append(col(self.model.worker_hostname).contains(query.worker_hostname, autoescape=True))
        return filters

    def _time_filter(self, days: int):
        cutoff = timezone.now() - timedelta(days=days)
        return col(self.model.create_time) >= cutoff

    async def get_stats_summary(self, days: int) -> TaskStatsSummary:
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
        result = (await self.session.exec(statement)).mappings().one()  # type: ignore[union-attr]  # ty: ignore[no-matching-overload]
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
    ) -> list[TaskStatsTimeline]:
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
        results = (await self.session.exec(statement)).mappings().all()  # type: ignore[union-attr]  # ty: ignore[unresolved-attribute]
        return [
            TaskStatsTimeline(
                time_bucket=row["time_bucket"],
                total=row["total"],
                success=row["success"],
                failure=row["failure"],
            )
            for row in results
        ]

    async def get_stats_by_name(self, query: TaskGroupQuery) -> PaginatedResponse[TaskStatsByName]:
        grouped = (
            sa_select(
                col(self.model.task_name),
                func.count().label("total"),
                func.count(case((col(self.model.status) == TaskStatus.SUCCESS, 1))).label("success"),
                func.count(case((col(self.model.status) == TaskStatus.FAILURE, 1))).label("failure"),
                func.count(
                    case((col(self.model.status).in_([TaskStatus.PENDING, TaskStatus.STARTED, TaskStatus.RETRY]), 1))
                ).label("in_progress"),
                func.max(col(self.model.create_time)).label("last_executed_at"),
                func.avg(case((col(self.model.status) == TaskStatus.SUCCESS, col(self.model.runtime)))).label(
                    "avg_runtime"
                ),
            )
            .filter(*self._task_filters(query))
            .group_by(col(self.model.task_name))
            .subquery()
        )
        total = (await self.session.exec(sa_select(func.count()).select_from(grouped))).scalar_one()
        sort_column = grouped.c[
            {"lastExecutedAt": "last_executed_at", "total": "total", "failure": "failure"}[query.sort_by]
        ]
        statement = (
            sa_select(grouped)
            .order_by(sort_column.asc() if query.sort_order == "asc" else sort_column.desc(), grouped.c.task_name.asc())
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
        )
        rows = (await self.session.exec(statement)).mappings().all()
        records = [
            TaskStatsByName(
                **{key: value for key, value in row.items() if key != "avg_runtime"},
                success_rate=round(row["success"] / (row["success"] + row["failure"]) * 100, 2)
                if row["success"] + row["failure"]
                else None,
                avg_runtime=round(row["avg_runtime"], 3) if row["avg_runtime"] is not None else None,
            )
            for row in rows
        ]
        return PaginatedResponse(records=records, total=total, page=query.page, page_size=query.page_size)

    async def get_stats_by_worker(self, days: int) -> list[TaskStatsByWorker]:
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
        results = (await self.session.exec(statement)).all()  # type: ignore[call-overload]  # ty: ignore[no-matching-overload]
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
