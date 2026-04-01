"""
Schedule domain API routes.

Author  : Claude
Date    : 2026-04-01
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.schemas.response import PaginatedResponse, Response
from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.domains.role.deps import verify_user_permission
from src.domains.schedule.deps import PeriodicTaskCrudDep
from src.domains.schedule.schemas import (
    PeriodicTaskCreate,
    PeriodicTaskListResponse,
    PeriodicTaskQueryRequest,
    PeriodicTaskResponse,
    PeriodicTaskUpdate,
)
from src.queues.models import TaskType

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
        raise AppException(StatusCode.RESOURCE_NOT_FOUND)
    return Response(data=data)


@router.post("")
async def create_schedule(
    body: PeriodicTaskCreate,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """创建定时任务。"""
    # 根据 task_type 创建对应的 schedule 记录
    if body.task_type == TaskType.INTERVAL:
        if not body.interval:
            raise AppException(StatusCode.VALIDATION_ERROR)
        schedule = await crud.interval_crud.create(body.interval)
    elif body.task_type == TaskType.CRONTAB:
        if not body.crontab:
            raise AppException(StatusCode.VALIDATION_ERROR)
        schedule = await crud.crontab_crud.create(body.crontab)
    else:
        raise AppException(StatusCode.VALIDATION_ERROR)

    # 创建 PeriodicTask
    task_data = body.model_dump(exclude={"interval", "crontab"})
    task_data["schedule_id"] = schedule.id
    task = await crud.create(task_data)

    # 返回带调度详情的响应
    result = await crud.get_with_schedule(task.id)
    return Response(data=result)


@router.put("/{schedule_id}")
async def update_schedule(
    schedule_id: UUID,
    body: PeriodicTaskUpdate,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """更新定时任务。"""
    task = await crud.get(schedule_id, nullable=False)

    # 更新调度配置（如果提供了新的）
    if body.interval and task.task_type == TaskType.INTERVAL:
        await crud.interval_crud.update_by_id(task.schedule_id, body.interval)
    elif body.crontab and task.task_type == TaskType.CRONTAB:
        await crud.crontab_crud.update_by_id(task.schedule_id, body.crontab)

    # 更新 PeriodicTask 字段
    task_data = body.model_dump(exclude={"interval", "crontab"}, exclude_unset=True)
    if task_data:
        await crud.update(task, task_data)

    result = await crud.get_with_schedule(schedule_id)
    return Response(data=result)


@router.patch("/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: UUID,
    crud: PeriodicTaskCrudDep,
) -> Response[PeriodicTaskResponse]:
    """启用/禁用定时任务。"""
    task = await crud.get(schedule_id, nullable=False)
    await crud.update(task, {"enabled": not task.enabled})

    result = await crud.get_with_schedule(schedule_id)
    return Response(data=result)


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: UUID,
    crud: PeriodicTaskCrudDep,
) -> Response[bool]:
    """删除定时任务（级联删除调度记录）。"""
    task = await crud.get(schedule_id, nullable=False)

    # 删除对应的 schedule 记录
    if task.task_type == TaskType.INTERVAL:
        await crud.interval_crud.delete(task.schedule_id)
    elif task.task_type == TaskType.CRONTAB:
        await crud.crontab_crud.delete(task.schedule_id)

    # 删除 PeriodicTask
    await crud.delete(schedule_id)
    return Response(data=True)
