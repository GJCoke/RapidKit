"""
Worker domain API routes.

Author  : Claude
Date    : 2026-03-30
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.schemas.response import PaginatedResponse, Response
from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.domains.role.deps import verify_user_permission
from src.domains.worker.deps import TaskResultCrudDep, WorkerCrudDep
from src.domains.worker.schemas import (
    ActiveTaskInfo,
    PoolResizeRequest,
    QueueOperateRequest,
    RegisteredTaskResponse,
    TaskListResponse,
    TaskQueryRequest,
    TaskResponse,
    TaskStatsByName,
    TaskStatsByWorker,
    TaskStatsSummary,
    TaskStatsTimeline,
    TriggerTaskRequest,
    TriggerTaskResponse,
    WorkerControlResponse,
    WorkerQueryRequest,
    WorkerResponse,
)
from src.domains.worker.services import (
    add_consumer,
    cancel_consumer,
    get_active_tasks,
    get_registered_tasks,
    get_reserved_tasks,
    ping_worker,
    pool_grow,
    pool_shrink,
    revoke_task,
    shutdown_worker,
    trigger_task,
)

router = APIRouter(
    prefix="/workers",
    tags=["Worker"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("")
async def get_workers(
    query: Annotated[WorkerQueryRequest, Query(...)],
    crud: WorkerCrudDep,
) -> Response[PaginatedResponse[WorkerResponse]]:
    """分页查询 Worker 列表，支持 status/hostname 筛选。"""
    data = await crud.get_paginate_workers(query)
    return Response(data=data)


@router.get("/all")
async def get_all_workers(
    crud: WorkerCrudDep,
) -> Response[list[WorkerResponse]]:
    """获取所有 Worker（不分页，用于概览卡片）。"""
    data = await crud.get_all_workers()
    return Response(data=data)


@router.get("/{worker_id}")
async def get_worker(
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerResponse]:
    """获取单个 Worker 详情。"""
    worker = await crud.get(worker_id)
    if not worker:
        raise AppException(StatusCode.WORKER_NOT_FOUND)
    return Response(data=WorkerResponse.model_validate(worker))


# ==================== Worker Control Routes ====================


@router.post("/{worker_id}/ping")
async def ping_worker_endpoint(
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """Ping Worker 检查是否可达。"""
    worker = await crud.get(worker_id, nullable=False)
    reachable = ping_worker(worker.hostname)
    return Response(
        data=WorkerControlResponse(
            success=reachable,
            message="Worker is reachable" if reachable else "Worker is not reachable",
        )
    )


@router.post("/{worker_id}/shutdown")
async def shutdown_worker_endpoint(
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """优雅关闭 Worker。"""
    worker = await crud.get(worker_id, nullable=False)
    shutdown_worker(worker.hostname)
    return Response(data=WorkerControlResponse(success=True, message="Shutdown command sent"))


@router.post("/{worker_id}/pool/grow")
async def pool_grow_endpoint(
    worker_id: UUID,
    body: PoolResizeRequest,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """扩容 Worker Pool。"""
    worker = await crud.get(worker_id, nullable=False)
    pool_grow(worker.hostname, body.n)
    return Response(data=WorkerControlResponse(success=True, message=f"Pool grow +{body.n} command sent"))


@router.post("/{worker_id}/pool/shrink")
async def pool_shrink_endpoint(
    worker_id: UUID,
    body: PoolResizeRequest,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """缩容 Worker Pool。"""
    worker = await crud.get(worker_id, nullable=False)
    pool_shrink(worker.hostname, body.n)
    return Response(data=WorkerControlResponse(success=True, message=f"Pool shrink -{body.n} command sent"))


@router.post("/{worker_id}/queues/add")
async def add_queue_endpoint(
    worker_id: UUID,
    body: QueueOperateRequest,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """让 Worker 监听新队列。"""
    worker = await crud.get(worker_id, nullable=False)
    add_consumer(worker.hostname, body.queue)
    return Response(data=WorkerControlResponse(success=True, message=f"Add consumer '{body.queue}' command sent"))


@router.post("/{worker_id}/queues/cancel")
async def cancel_queue_endpoint(
    worker_id: UUID,
    body: QueueOperateRequest,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """让 Worker 停止监听队列。"""
    worker = await crud.get(worker_id, nullable=False)
    cancel_consumer(worker.hostname, body.queue)
    return Response(data=WorkerControlResponse(success=True, message=f"Cancel consumer '{body.queue}' command sent"))


@router.get("/{worker_id}/tasks/active")
async def get_active_tasks_endpoint(
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[list[ActiveTaskInfo]]:
    """查看 Worker 正在执行的任务。"""
    worker = await crud.get(worker_id, nullable=False)
    tasks = get_active_tasks(worker.hostname)
    result = [
        ActiveTaskInfo(
            id=t.get("id", ""),
            name=t.get("name", ""),
            args=str(t.get("args", "")),
            kwargs=str(t.get("kwargs", "")),
            worker_pid=t.get("worker_pid"),
            time_start=t.get("time_start"),
        )
        for t in tasks
    ]
    return Response(data=result)


@router.get("/{worker_id}/tasks/reserved")
async def get_reserved_tasks_endpoint(
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[list[ActiveTaskInfo]]:
    """查看 Worker 预取的待执行任务。"""
    worker = await crud.get(worker_id, nullable=False)
    tasks = get_reserved_tasks(worker.hostname)
    result = [
        ActiveTaskInfo(
            id=t.get("id", ""),
            name=t.get("name", ""),
            args=str(t.get("args", "")),
            kwargs=str(t.get("kwargs", "")),
            worker_pid=t.get("worker_pid"),
            time_start=t.get("time_start"),
        )
        for t in tasks
    ]
    return Response(data=result)


# ==================== Task Routes ====================

task_router = APIRouter(prefix="/tasks", tags=["Task"])


@task_router.get("")
async def get_tasks(
    query: Annotated[TaskQueryRequest, Query(...)],
    crud: TaskResultCrudDep,
) -> Response[PaginatedResponse[TaskListResponse]]:
    """分页查询任务历史，支持 status/task_name/worker_hostname 筛选。"""
    data = await crud.get_paginate_tasks(query)
    return Response(data=data)


@task_router.get("/stats/summary")
async def get_task_stats_summary(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
) -> Response[TaskStatsSummary]:
    """获取任务统计概览。"""
    data = await crud.get_stats_summary(days)
    return Response(data=data)


@task_router.get("/stats/timeline")
async def get_task_stats_timeline(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
    start: date | None = Query(None, description="开始日期"),
    end: date | None = Query(None, description="结束日期"),
    granularity: str = Query("hour", description="粒度: hour | day"),
) -> Response[list[TaskStatsTimeline]]:
    """获取任务吞吐量时间线，支持自定义日期范围和粒度。"""
    data = await crud.get_stats_timeline(days, start=start, end=end, granularity=granularity)
    return Response(data=data)


@task_router.get("/stats/by-name")
async def get_task_stats_by_name(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
) -> Response[list[TaskStatsByName]]:
    """按任务名称统计 Top 10。"""
    data = await crud.get_stats_by_name(days)
    return Response(data=data)


@task_router.get("/stats/by-worker")
async def get_task_stats_by_worker(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
) -> Response[list[TaskStatsByWorker]]:
    """按 Worker 统计。"""
    data = await crud.get_stats_by_worker(days)
    return Response(data=data)


@task_router.get("/registered")
async def get_registered_task_list() -> Response[RegisteredTaskResponse]:
    """获取所有已注册的 Celery 任务列表。"""
    tasks = get_registered_tasks()
    return Response(data=RegisteredTaskResponse(tasks=tasks))


@task_router.get("/{task_id}")
async def get_task(
    task_id: str,
    crud: TaskResultCrudDep,
) -> Response[TaskResponse]:
    """获取单个任务详情（含 traceback）。"""
    task = await crud.get_by_task_id(task_id)
    if not task:
        raise AppException(StatusCode.TASK_NOT_FOUND)
    return Response(data=TaskResponse.model_validate(task))


@task_router.post("/trigger")
async def trigger_task_endpoint(
    body: TriggerTaskRequest,
    crud: TaskResultCrudDep,
) -> Response[TriggerTaskResponse]:
    """手动触发任务。"""
    data = await trigger_task(body.task_name, body.args, body.kwargs)
    return Response(data=data)


@task_router.post("/{task_id}/revoke")
async def revoke_task_endpoint(
    task_id: str,
) -> Response[bool]:
    """撤销任务。"""
    revoke_task(task_id, terminate=True)
    return Response(data=True)
