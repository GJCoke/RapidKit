"""
定时任务业务逻辑。

Author : Coke
Date   : 2026-05-11
"""

from typing import cast
from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException

from plugin_schedule.crud import PeriodicTaskCRUD
from plugin_schedule.schedule_types import TaskType
from plugin_schedule.schemas import PeriodicTaskCreate, PeriodicTaskResponse, PeriodicTaskUpdate
from plugin_schedule.status_codes import ScheduleStatusCode

logger = get_plugin_logger("Schedule")


async def create_periodic_task(
    crud: PeriodicTaskCRUD,
    body: PeriodicTaskCreate,
) -> PeriodicTaskResponse:
    """创建定时任务及其关联的调度记录。"""
    if body.task_type == TaskType.INTERVAL:
        if not body.interval:
            raise AppException(ScheduleStatusCode.INTERVAL_DATA_REQUIRED)
        schedule = await crud.interval_crud.create(body.interval)
    elif body.task_type == TaskType.CRONTAB:
        if not body.crontab:
            raise AppException(ScheduleStatusCode.CRONTAB_DATA_REQUIRED)
        schedule = await crud.crontab_crud.create(body.crontab)
    else:
        raise AppException(ScheduleStatusCode.UNSUPPORTED_TASK_TYPE)

    task_data = body.model_dump(exclude={"interval", "crontab"})
    task_data["schedule_id"] = schedule.id
    task = await crud.create(task_data)
    logger.info("Task created: {task_name}", task_name=body.task)

    return cast(PeriodicTaskResponse, await crud.get_with_schedule(task.id))


async def update_periodic_task(
    crud: PeriodicTaskCRUD,
    schedule_id: UUID,
    body: PeriodicTaskUpdate,
) -> PeriodicTaskResponse:
    """更新定时任务及其调度配置。"""
    task = await crud.get(schedule_id, nullable=False)

    if body.interval and task.task_type == TaskType.INTERVAL:
        await crud.interval_crud.update_by_id(task.schedule_id, body.interval)
    elif body.crontab and task.task_type == TaskType.CRONTAB:
        await crud.crontab_crud.update_by_id(task.schedule_id, body.crontab)

    task_data = body.model_dump(exclude={"interval", "crontab"}, exclude_unset=True)
    if task_data:
        await crud.update_by_id(task.id, task_data)

    logger.info("Task updated: {schedule_id}", schedule_id=schedule_id)
    return cast(PeriodicTaskResponse, await crud.get_with_schedule(schedule_id))


async def delete_periodic_task(crud: PeriodicTaskCRUD, schedule_id: UUID) -> None:
    """删除定时任务及其关联的调度记录。"""
    task = await crud.get(schedule_id, nullable=False)

    if task.task_type == TaskType.INTERVAL:
        await crud.interval_crud.delete(task.schedule_id)
    elif task.task_type == TaskType.CRONTAB:
        await crud.crontab_crud.delete(task.schedule_id)

    await crud.delete(schedule_id)
    logger.info("Task deleted: {task_name}", task_name=task.name)
