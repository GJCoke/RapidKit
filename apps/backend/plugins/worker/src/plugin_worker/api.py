"""
工作节点管理与任务监控接口。

Author  : Claude
Date    : 2026-03-30
"""

from asyncio import gather, to_thread
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request
from rapidkit_common.access import Require
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException

from plugin_worker.dashboard import get_queue_dashboard, resolve_worker_subscriptions
from plugin_worker.deps import TaskResultCrudDep, WorkerCrudDep
from plugin_worker.runtime import inspect_worker_runtime
from plugin_worker.schemas import (
    ActiveTaskInfo,
    PoolResizeRequest,
    QueueDashboardResponse,
    QueueOperateRequest,
    RegisteredTaskResponse,
    TaskGroupQuery,
    TaskListResponse,
    TaskQueryRequest,
    TaskResponse,
    TaskStatsByName,
    TaskStatsByWorker,
    TaskStatsSummary,
    TriggerTaskRequest,
    TriggerTaskResponse,
    WorkerControlResponse,
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
from plugin_worker.status_codes import WorkerStatusCode

router = APIRouter(
    prefix="/workers",
    tags=["Worker"],
)


@router.get("/all", dependencies=[Require("worker:read")])
async def get_all_workers(crud: WorkerCrudDep) -> Response[list[WorkerResponse]]:
    """获取全部工作节点。"""
    data = await crud.get_all_workers()
    return Response(data=data)


@router.get("/{worker_id}", dependencies=[Require("worker:read")])
async def get_worker(worker_id: UUID, crud: WorkerCrudDep, request: Request) -> Response[WorkerResponse]:
    """获取工作节点详情，并补充队列订阅和实时运行信息。"""
    worker = await crud.get(worker_id)
    if not worker:
        raise AppException(WorkerStatusCode.WORKER_NOT_FOUND)
    celery_app = getattr(request.app.state, "celery_app", None)
    runtime = {}
    if celery_app is not None:
        (enriched, _), runtime = await gather(
            resolve_worker_subscriptions(celery_app, [worker], timezone.now()),
            inspect_worker_runtime(celery_app, worker.hostname),
        )
        worker = enriched[0]
    return Response(data=WorkerResponse.model_validate(worker).model_copy(update=runtime))


@router.post("/{worker_id}/ping", dependencies=[Require("worker:control")])
async def ping_worker_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """检测指定工作节点是否可达。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    reachable = ping_worker(celery_app, worker.hostname)
    return Response(
        data=WorkerControlResponse(
            success=reachable,
            message="Worker is reachable" if reachable else "Worker is not reachable",
        )
    )


@router.post("/{worker_id}/shutdown", dependencies=[Require("worker:control")])
async def shutdown_worker_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[WorkerControlResponse]:
    """向指定工作节点发送关闭命令。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    shutdown_worker(celery_app, worker.hostname)
    return Response(data=WorkerControlResponse(success=True, message="Shutdown command sent"))


@router.post("/{worker_id}/pool/grow", dependencies=[Require("worker:control")])
async def pool_grow_endpoint(
    request: Request, worker_id: UUID, body: PoolResizeRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    """向指定工作节点发送进程池扩容命令。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    await to_thread(pool_grow, celery_app, worker.hostname, body.n)
    return Response(data=WorkerControlResponse(success=True, message=f"Pool grow +{body.n} command sent"))


@router.post("/{worker_id}/pool/shrink", dependencies=[Require("worker:control")])
async def pool_shrink_endpoint(
    request: Request, worker_id: UUID, body: PoolResizeRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    """向指定工作节点发送进程池缩容命令。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    await to_thread(pool_shrink, celery_app, worker.hostname, body.n)
    return Response(data=WorkerControlResponse(success=True, message=f"Pool shrink -{body.n} command sent"))


@router.post("/{worker_id}/queues/add", dependencies=[Require("worker:control")])
async def add_queue_endpoint(
    request: Request, worker_id: UUID, body: QueueOperateRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    """为指定工作节点添加消费队列。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    add_consumer(celery_app, worker.hostname, body.queue)
    return Response(data=WorkerControlResponse(success=True, message=f"Add consumer '{body.queue}' command sent"))


@router.post("/{worker_id}/queues/cancel", dependencies=[Require("worker:control")])
async def cancel_queue_endpoint(
    request: Request, worker_id: UUID, body: QueueOperateRequest, crud: WorkerCrudDep
) -> Response[WorkerControlResponse]:
    """取消指定工作节点对队列的消费订阅。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    cancel_consumer(celery_app, worker.hostname, body.queue)
    return Response(data=WorkerControlResponse(success=True, message=f"Cancel consumer '{body.queue}' command sent"))


@router.get("/{worker_id}/tasks/active", dependencies=[Require("worker:read")])
async def get_active_tasks_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[list[ActiveTaskInfo]]:
    """获取指定工作节点正在执行的任务。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    tasks = await to_thread(get_active_tasks, celery_app, worker.hostname)
    return Response(data=parse_task_info_list(tasks))


@router.get("/{worker_id}/tasks/reserved", dependencies=[Require("worker:read")])
async def get_reserved_tasks_endpoint(
    request: Request,
    worker_id: UUID,
    crud: WorkerCrudDep,
) -> Response[list[ActiveTaskInfo]]:
    """获取指定工作节点已预取、等待执行的任务。"""
    celery_app = request.app.state.celery_app
    worker = await crud.get(worker_id, nullable=False)
    tasks = await to_thread(get_reserved_tasks, celery_app, worker.hostname)
    return Response(data=parse_task_info_list(tasks))


# ==================== 任务路由 ====================

task_router = APIRouter(prefix="/tasks", tags=["Task"])


@task_router.get("", dependencies=[Require("task:read")])
async def get_tasks(
    query: Annotated[TaskQueryRequest, Query(...)],
    crud: TaskResultCrudDep,
) -> Response[PaginatedResponse[TaskListResponse]]:
    """分页查询任务执行记录。"""
    data = await crud.get_paginate_tasks(query)
    return Response(data=data)


@task_router.get("/stats/dashboard", dependencies=[Require("worker:read")])
async def get_queue_dashboard_endpoint(
    request: Request, session: SessionDep, days: int = Query(1, ge=1, le=90)
) -> Response[QueueDashboardResponse]:
    """获取指定时间范围内的队列监控总览。"""
    return Response(data=await get_queue_dashboard(session, request.app.state.celery_app, days))


@task_router.get("/stats/summary", dependencies=[Require("task:stats")])
async def get_task_stats_summary(
    crud: TaskResultCrudDep, days: int = Query(7, ge=1, le=90)
) -> Response[TaskStatsSummary]:
    """获取指定天数内的任务执行统计摘要。"""
    data = await crud.get_stats_summary(days)
    return Response(data=data)


@task_router.get("/stats/by-name", dependencies=[Require("task:stats")])
async def get_task_stats_by_name(
    crud: TaskResultCrudDep,
    query: Annotated[TaskGroupQuery, Query(...)],
) -> Response[PaginatedResponse[TaskStatsByName]]:
    """按任务名称分页汇总任务执行情况。"""
    data = await crud.get_stats_by_name(query)
    return Response(data=data)


@task_router.get("/stats/by-worker", dependencies=[Require("task:stats")])
async def get_task_stats_by_worker(
    crud: TaskResultCrudDep,
    days: int = Query(7, ge=1, le=90),
) -> Response[list[TaskStatsByWorker]]:
    """按工作节点汇总指定天数内的任务执行情况。"""
    data = await crud.get_stats_by_worker(days)
    return Response(data=data)


@task_router.get("/registered", dependencies=[Require("task:registered")])
async def get_registered_task_list(request: Request) -> Response[RegisteredTaskResponse]:
    """获取已向任务队列注册的任务名称。"""
    celery_app = request.app.state.celery_app
    tasks = get_registered_tasks(celery_app)
    return Response(data=RegisteredTaskResponse(tasks=tasks))


@task_router.get("/{task_id}", dependencies=[Require("task:read")])
async def get_task(task_id: str, crud: TaskResultCrudDep) -> Response[TaskResponse]:
    """根据任务标识获取执行详情。"""
    task = await crud.get_by_task_id(task_id)
    if not task:
        raise AppException(WorkerStatusCode.TASK_NOT_FOUND)
    return Response(data=TaskResponse.model_validate(task))


@task_router.post("/trigger", dependencies=[Require("task:trigger")])
async def trigger_task_endpoint(
    request: Request,
    body: TriggerTaskRequest,
) -> Response[TriggerTaskResponse]:
    """使用指定参数手动触发已注册任务。"""
    celery_app = request.app.state.celery_app
    data = await trigger_task(celery_app, body.task_name, body.args, body.kwargs)
    return Response(data=data)


@task_router.post("/{task_id}/revoke", dependencies=[Require("task:revoke")])
async def revoke_task_endpoint(request: Request, task_id: str) -> Response[bool]:
    """撤销指定任务，并尝试终止正在执行的任务。"""
    celery_app = request.app.state.celery_app
    revoke_task(celery_app, task_id, terminate=True)
    return Response(data=True)
