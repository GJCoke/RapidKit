"""
Schedule domain API routes.

Author  : Coke
Date    : 2026-04-01
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.events import ScheduleCreatedEvent, ScheduleDeletedEvent, ScheduleToggledEvent
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException

from plugin_schedule.deps import PeriodicTaskCrudDep
from plugin_schedule.schemas import (
    PeriodicTaskCreate,
    PeriodicTaskListResponse,
    PeriodicTaskQueryRequest,
    PeriodicTaskResponse,
    PeriodicTaskUpdate,
)
from plugin_schedule.services import create_periodic_task, delete_periodic_task, update_periodic_task
from plugin_schedule.status_codes import ScheduleStatusCode

logger = get_plugin_logger("Schedule")

router = APIRouter(
    prefix="/schedules",
    tags=["Schedule"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("")
async def get_schedules(
    query: Annotated[PeriodicTaskQueryRequest, Query(...)],
    crud: PeriodicTaskCrudDep,
) -> Response[PaginatedResponse[PeriodicTaskListResponse]]:
    """分页查询定时任务列表。"""
    data = await crud.get_paginate_tasks(query)
    return Response(data=data)


@router.get("/{schedule_id}")
async def get_schedule(
    schedule_id: UUID,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """获取单个定时任务详情。"""
    data = await crud.get_with_schedule(schedule_id)
    if not data:
        raise AppException(ScheduleStatusCode.TASK_NOT_FOUND)
    return Response(data=data)


@router.post("")
async def create_schedule(
    body: PeriodicTaskCreate,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """创建定时任务。"""
    result = await create_periodic_task(crud, body)
    event_bus.fire_and_forget(ScheduleCreatedEvent(schedule_id=str(result.id), task_name=body.name))
    return Response(data=result)


@router.put("/{schedule_id}")
async def update_schedule(
    schedule_id: UUID,
    body: PeriodicTaskUpdate,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """更新定时任务。"""
    result = await update_periodic_task(crud, schedule_id, body)
    return Response(data=result)


@router.patch("/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: UUID,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """启用/禁用定时任务。"""
    task = await crud.get(schedule_id, nullable=False)
    await crud.update_by_id(task.id, {"enabled": not task.enabled})
    logger.info(
        "Task toggled: {task_name} enabled={enabled}",
        task_name=task.name,
        enabled=not task.enabled,
    )
    result = await crud.get_with_schedule(schedule_id)
    event_bus.fire_and_forget(ScheduleToggledEvent(schedule_id=str(schedule_id), enabled=not task.enabled))
    return Response(data=result)


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: UUID,
    crud: PeriodicTaskCrudDep,
) -> Response[bool]:
    """删除定时任务（级联删除调度记录）。"""
    task_info = await crud.get(schedule_id, nullable=False)
    await delete_periodic_task(crud, schedule_id)
    event_bus.fire_and_forget(ScheduleDeletedEvent(schedule_id=str(schedule_id), task_name=task_info.name or ""))
    return Response(data=True)
