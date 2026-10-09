"""
Schedule domain CRUD operations.

Author  : Claude
Date    : 2026-04-01
"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from sqlmodel import col, select

from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule
from plugin_schedule.schedule_types import TaskType
from plugin_schedule.schemas import (
    CrontabDefinition,
    IntervalDefinition,
    PeriodicTaskListResponse,
    PeriodicTaskQueryRequest,
    PeriodicTaskResponse,
    SolarDefinition,
)


class IntervalScheduleCRUD(BaseCRUD[IntervalSchedule]):
    model = IntervalSchedule


class CrontabScheduleCRUD(BaseCRUD[CrontabSchedule]):
    model = CrontabSchedule


class SolarScheduleCRUD(BaseCRUD[SolarSchedule]):
    model = SolarSchedule


class PeriodicTaskCRUD(BaseCRUD[PeriodicTask]):
    model = PeriodicTask

    async def get_locked(self, task_id: UUID) -> PeriodicTask:
        """Serialize association changes and deletions within the caller's transaction."""
        result = await self.session.exec(
            select(PeriodicTask)
            .where(PeriodicTask.id == task_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        task = result.first()
        if task is None:
            return await self.get(task_id, nullable=False)
        return task

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

    @property
    def solar_crud(self) -> SolarScheduleCRUD:
        if not hasattr(self, "_solar_crud"):
            self._solar_crud = SolarScheduleCRUD(self.session)
        return self._solar_crud

    def schedule_crud(self, task_type: TaskType):
        return {
            TaskType.INTERVAL: self.interval_crud,
            TaskType.CRONTAB: self.crontab_crud,
            TaskType.SOLAR: self.solar_crud,
        }[task_type]

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
        )
        records = [await self._response_data(item) for item in result.records]
        return PaginatedResponse[PeriodicTaskListResponse](
            page=result.page,
            page_size=result.page_size,
            total=result.total,
            records=[PeriodicTaskListResponse.model_validate(item) for item in records],
        )

    async def get_with_schedule(self, _id: UUID) -> PeriodicTaskResponse | None:
        task = await self.get(_id)
        if not task:
            return None
        return PeriodicTaskResponse.model_validate(await self._response_data(task))

    async def _response_data(self, task: PeriodicTask) -> dict:
        schedule = await self.schedule_crud(task.task_type).get(task.schedule_id, nullable=False)
        definition_type = {
            TaskType.INTERVAL: IntervalDefinition,
            TaskType.CRONTAB: CrontabDefinition,
            TaskType.SOLAR: SolarDefinition,
        }[task.task_type]
        definition = definition_type.model_validate(
            {
                "type": task.task_type.value,
                **{key: getattr(schedule, key) for key in definition_type.model_fields if key != "type"},
            }
        )
        return {**task.model_dump(), "schedule": definition}
