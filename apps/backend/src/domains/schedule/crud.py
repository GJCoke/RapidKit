"""
Schedule domain CRUD operations.

Author  : Claude
Date    : 2026-04-01
"""

from uuid import UUID

from sqlmodel import col
from sqlmodel.ext.asyncio.session import AsyncSession

from src.common.crud import BaseSQLModelCRUD
from src.common.schemas.response import PaginatedResponse
from src.domains.schedule.schemas import (
    CrontabScheduleCreate,
    CrontabScheduleResponse,
    IntervalScheduleCreate,
    IntervalScheduleResponse,
    PeriodicTaskCreate,
    PeriodicTaskListResponse,
    PeriodicTaskQueryRequest,
    PeriodicTaskResponse,
    PeriodicTaskUpdate,
)
from src.queues.models import TaskType
from src.queues.schedule import CrontabSchedule, IntervalSchedule, PeriodicTask


class IntervalScheduleCRUD(BaseSQLModelCRUD[IntervalSchedule, IntervalScheduleCreate, IntervalScheduleCreate]):
    """间隔调度 CRUD 操作。"""


class CrontabScheduleCRUD(BaseSQLModelCRUD[CrontabSchedule, CrontabScheduleCreate, CrontabScheduleCreate]):
    """Crontab 调度 CRUD 操作。"""


class PeriodicTaskCRUD(BaseSQLModelCRUD[PeriodicTask, PeriodicTaskCreate, PeriodicTaskUpdate]):
    """定时任务 CRUD 操作。"""

    def __init__(
        self,
        model: type[PeriodicTask],
        *,
        session: AsyncSession | None = None,
        auto_commit: bool = True,
    ) -> None:
        super().__init__(model, session=session, auto_commit=auto_commit)
        self._interval_crud: IntervalScheduleCRUD | None = None
        self._crontab_crud: CrontabScheduleCRUD | None = None

    @property
    def interval_crud(self) -> IntervalScheduleCRUD:
        if self._interval_crud is None:
            self._interval_crud = IntervalScheduleCRUD(IntervalSchedule, session=self._session)
        return self._interval_crud

    @property
    def crontab_crud(self) -> CrontabScheduleCRUD:
        if self._crontab_crud is None:
            self._crontab_crud = CrontabScheduleCRUD(CrontabSchedule, session=self._session)
        return self._crontab_crud

    async def get_paginate_tasks(
        self,
        query: PeriodicTaskQueryRequest,
        *,
        session: AsyncSession | None = None,
    ) -> PaginatedResponse[PeriodicTaskListResponse]:
        """分页查询定时任务，支持 enabled/task_name 筛选。"""
        filters = []
        if query.enabled is not None:
            filters.append(col(self.model.enabled) == query.enabled)
        if query.task_name:
            filters.append(col(self.model.task).contains(query.task_name))

        result = await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=col(self.model.create_time).desc(),
            session=session,
            serializer=PeriodicTaskListResponse,
        )

        # 为每条记录填充调度详情
        for item in result.records:
            await self._fill_schedule_detail(item, session=session)

        return result

    async def get_with_schedule(
        self,
        _id: UUID,
        *,
        session: AsyncSession | None = None,
    ) -> PeriodicTaskResponse | None:
        """查询定时任务详情，含调度配置。"""
        task = await self.get(_id, session=session)
        if not task:
            return None

        response = PeriodicTaskResponse.model_validate(task)
        await self._fill_schedule_detail(response, session=session)
        return response

    async def _fill_schedule_detail(
        self,
        item: PeriodicTaskListResponse | PeriodicTaskResponse,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        """根据 task_type 填充调度详情。"""
        if item.task_type == TaskType.INTERVAL:
            schedule = await self.interval_crud.get(item.schedule_id, session=session)
            if schedule:
                item.interval = IntervalScheduleResponse.model_validate(schedule)
        elif item.task_type == TaskType.CRONTAB:
            schedule = await self.crontab_crud.get(item.schedule_id, session=session)
            if schedule:
                item.crontab = CrontabScheduleResponse.model_validate(schedule)
