"""
Schedule domain CRUD operations.

Author  : Claude
Date    : 2026-04-01
"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from sqlmodel import col

from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask
from plugin_schedule.schedule_types import TaskType
from plugin_schedule.schemas import (
    CrontabScheduleResponse,
    IntervalScheduleResponse,
    PeriodicTaskListResponse,
    PeriodicTaskQueryRequest,
    PeriodicTaskResponse,
)


class IntervalScheduleCRUD(BaseCRUD[IntervalSchedule]):
    model = IntervalSchedule


class CrontabScheduleCRUD(BaseCRUD[CrontabSchedule]):
    model = CrontabSchedule


class PeriodicTaskCRUD(BaseCRUD[PeriodicTask]):
    model = PeriodicTask

    @property
    def interval_crud(self) -> IntervalScheduleCRUD:
        if not hasattr(self, "_interval_crud"):
            self._interval_crud = IntervalScheduleCRUD(self.session)
        return self._interval_crud

    @property
    def crontab_crud(self) -> CrontabScheduleCRUD:
        if not hasattr(self, "_crontab_crud"):
            self._crontab_crud = CrontabScheduleCRUD(self.session)
        return self._crontab_crud

    async def get_paginate_tasks(self, query: PeriodicTaskQueryRequest) -> PaginatedResponse[PeriodicTaskListResponse]:
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
            schema=PeriodicTaskListResponse,
        )
        for item in result.records:
            await self._fill_schedule_detail(item)
        return result

    async def get_with_schedule(self, _id: UUID) -> PeriodicTaskResponse | None:
        task = await self.get(_id)
        if not task:
            return None
        response = PeriodicTaskResponse.model_validate(task)
        await self._fill_schedule_detail(response)
        return response

    async def _fill_schedule_detail(
        self,
        item: PeriodicTaskListResponse | PeriodicTaskResponse,
    ) -> None:
        if item.task_type == TaskType.INTERVAL:
            schedule = await self.interval_crud.get(item.schedule_id)
            if schedule:
                item.interval = IntervalScheduleResponse.model_validate(schedule)
        elif item.task_type == TaskType.CRONTAB:
            schedule = await self.crontab_crud.get(item.schedule_id)
            if schedule:
                item.crontab = CrontabScheduleResponse.model_validate(schedule)
