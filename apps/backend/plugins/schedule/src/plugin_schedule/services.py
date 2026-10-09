"""Atomic management of periodic tasks and polymorphic schedule records.

Author : Coke
Date   : 2026-10-08
"""

from typing import cast
from uuid import UUID

from rapidkit_core.log import get_plugin_logger

from plugin_schedule.crud import PeriodicTaskCRUD
from plugin_schedule.schedule_types import TaskType
from plugin_schedule.schemas import PeriodicTaskCreate, PeriodicTaskResponse, PeriodicTaskUpdate

logger = get_plugin_logger("Schedule")


async def create_periodic_task(crud: PeriodicTaskCRUD, body: PeriodicTaskCreate) -> PeriodicTaskResponse:
    """Create both records in the caller's transaction."""
    task_type = TaskType(body.schedule.type)
    schedule = await crud.schedule_crud(task_type).create(body.schedule.model_dump(exclude={"type"}))
    task = await crud.create(
        {
            **body.model_dump(exclude={"schedule"}),
            "task_type": task_type,
            "schedule_id": schedule.id,
        }
    )
    logger.info("Task created: {task_name}", task_name=body.task)
    return cast(PeriodicTaskResponse, await crud.get_with_schedule(task.id))


async def update_periodic_task(
    crud: PeriodicTaskCRUD, schedule_id: UUID, body: PeriodicTaskUpdate
) -> PeriodicTaskResponse:
    """Replace the association when switching type; retain arguments unless supplied."""
    task = await crud.get_locked(schedule_id)
    task_data = body.model_dump(exclude={"schedule"}, exclude_unset=True)
    old_type, old_id = task.task_type, task.schedule_id
    switched = False
    if body.schedule is not None:
        task_type = TaskType(body.schedule.type)
        schedule_data = body.schedule.model_dump(exclude={"type"})
        schedule_crud = crud.schedule_crud(task_type)
        if task_type == old_type:
            await schedule_crud.update_by_id(old_id, schedule_data)
        else:
            schedule = await schedule_crud.create(schedule_data)
            task_data.update(task_type=task_type, schedule_id=schedule.id)
            switched = True
    if task_data:
        await crud.update_by_id(task.id, task_data)
    if switched:
        await crud.schedule_crud(old_type).delete(old_id)
    logger.info("Task updated: {schedule_id}", schedule_id=schedule_id)
    return cast(PeriodicTaskResponse, await crud.get_with_schedule(schedule_id))


async def delete_periodic_task(crud: PeriodicTaskCRUD, schedule_id: UUID) -> None:
    """Delete task and configuration in the same transaction."""
    task = await crud.get_locked(schedule_id)
    task_type, config_id = task.task_type, task.schedule_id
    await crud.delete(schedule_id)
    await crud.schedule_crud(task_type).delete(config_id)
    logger.info("Task deleted: {task_name}", task_name=task.name)
