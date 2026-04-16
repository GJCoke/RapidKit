"""
Worker domain API routes.

Author  : Claude
Date    : 2026-03-30
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode

from plugin_worker.deps import TaskResultCrudDep, WorkerCrudDep
from plugin_worker.schemas import (
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
from plugin_worker.services import (
    add_consumer,
    cancel_consumer,
    get_active_tasks,
    get_registered_tasks,
    get_reserved_tasks,
    parse_task_info_list,
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
    data = await crud.get_paginate_workers(query)
    return Response(data=data)


@router.get("/all")
async def get_all_workers(crud: WorkerCrudDep) -> Response[list[WorkerResponse]]:
    data = await crud.get_all_workers()
    return Response(data=data)


@router.get("/{worker_id}")
async def get_worker(worker_id: UUID, crud: WorkerCrudDep) -> Response[WorkerResponse]:
    worker = await crud.get(worker_id)
    if not worker:
        raise AppException(StatusCode.WORKER_NOT_FOUND)
    return Response(data=WorkerResponse.model_validate(worker))


@router.post("/{worker_id}/ping")
async def ping_worker_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    reachable = ping_worker(celery_app, worker.hostname)
    return Response(
        data=WorkerControlResponse(
            success=reachable,
            message="Worker is reachable" if reachable else "Worker is not reachable",
        )
    )


@router.post("/{worker_id}/shutdown")
async def shutdown_worker_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    shutdown_worker(celery_app, worker.hostname)
    return Response(data=WorkerControlResponse(success=True, message="Shutdown command sent"))


@router.post("/{worker_id}/pool/grow")
async def pool_grow_endpoint(
    request: Request, worker_id: UUID, body: PoolResizeRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    pool_grow(celery_app, worker.hostname, body.n)
    return Response(data=WorkerControlResponse(success=True, message=f"Pool grow +{body.n} command sent"))


@router.post("/{worker_id}/pool/shrink")
async def pool_shrink_endpoint(
    request: Request, worker_id: UUID, body: PoolResizeRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    pool_shrink(celery_app, worker.hostname, body.n)
    return Response(data=WorkerControlResponse(success=True, message=f"Pool shrink -{body.n} command sent"))


@router.post("/{worker_id}/queues/add")
async def add_queue_endpoint(
    request: Request, worker_id: UUID, body: QueueOperateRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    add_consumer(celery_app, worker.hostname, body.queue)
    return Response(data=WorkerControlResponse(success=True, message=f"Add consumer '{body.queue}' command sent"))


@router.post("/{worker_id}/queues/cancel")
async def cancel_queue_endpoint(
    request: Request, worker_id: UUID, body: QueueOperateRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    cancel_consumer(celery_app, worker.hostname, body.queue)
    return Response(data=WorkerControlResponse(success=True, message=f"Cancel consumer '{body.queue}' command sent"))


@router.get("/{worker_id}/tasks/active")
async def get_active_tasks_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[list[ActiveTaskInfo]]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    tasks = get_active_tasks(celery_app, worker.hostname)
    return Response(data=parse_task_info_list(tasks))


@router.get("/{worker_id}/tasks/reserved")
async def get_reserved_tasks_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[list[ActiveTaskInfo]]:
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    tasks = get_reserved_tasks(celery_app, worker.hostname)
    return Response(data=parse_task_info_list(tasks))


# ==================== Task Routes ====================

task_router = APIRouter(prefix="/tasks", tags=["Task"])


@task_router.get("")
async def get_tasks(
    query: Annotated[TaskQueryRequest, Query(...)],
    crud: TaskResultCrudDep,
) -> Response[PaginatedResponse[TaskListResponse]]:
    data = await crud.get_paginate_tasks(query)
    return Response(data=data)


@task_router.get("/stats/summary")
async def get_task_stats_summary(
    crud: TaskResultCrudDep, days: int = Query(7, ge=1, le=90)
) -> Response[TaskStatsSummary]:
    data = await crud.get_stats_summary(days)
    return Response(data=data)


@task_router.get("/stats/timeline")
async def get_task_stats_timeline(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
    start: date | None = Query(None),
    end: date | None = Query(None),
    granularity: str = Query("hour"),
) -> Response[list[TaskStatsTimeline]]:
    data = await crud.get_stats_timeline(days, start=start, end=end, granularity=granularity)
    return Response(data=data)


@task_router.get("/stats/by-name")
async def get_task_stats_by_name(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
) -> Response[list[TaskStatsByName]]:
    data = await crud.get_stats_by_name(days)
    return Response(data=data)


@task_router.get("/stats/by-worker")
async def get_task_stats_by_worker(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
) -> Response[list[TaskStatsByWorker]]:
    data = await crud.get_stats_by_worker(days)
    return Response(data=data)


@task_router.get("/registered")
async def get_registered_task_list(request: Request) -> Response[RegisteredTaskResponse]:
    celery_app = request.app.state.celery_app
    tasks = get_registered_tasks(celery_app)
    return Response(data=RegisteredTaskResponse(tasks=tasks))


@task_router.get("/{task_id}")
async def get_task(task_id: str, crud: TaskResultCrudDep) -> Response[TaskResponse]:
    task = await crud.get_by_task_id(task_id)
    if not task:
        raise AppException(StatusCode.TASK_NOT_FOUND)
    return Response(data=TaskResponse.model_validate(task))


@task_router.post("/trigger")
async def trigger_task_endpoint(
    request: Request,
    body: TriggerTaskRequest,
) -> Response[TriggerTaskResponse]:
    celery_app = request.app.state.celery_app
    data = await trigger_task(celery_app, body.task_name, body.args, body.kwargs)
    return Response(data=data)


@task_router.post("/{task_id}/revoke")
async def revoke_task_endpoint(request: Request, task_id: str) -> Response[bool]:
    celery_app = request.app.state.celery_app
    revoke_task(celery_app, task_id, terminate=True)
    return Response(data=True)
