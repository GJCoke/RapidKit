"""
Worker domain schemas.

Author  : Claude
Date    : 2026-03-30
"""

from typing import Any

from pydantic import Field

from src.common.schemas import BaseModel, BaseRequest
from src.common.schemas.request import PaginatedRequest
from src.common.schemas.response import BaseSchema, LocalDatetime
from src.utils.enums import TaskStatus, WorkerStatus

# ==================== Worker Schemas ====================


class WorkerSchema(BaseModel):
    """Worker 共享字段。"""

    hostname: str
    status: WorkerStatus = WorkerStatus.ONLINE
    active_queues: list = []
    concurrency: int = 0
    processed_count: int = 0
    active_task_count: int = 0
    load_average: dict = {}
    software_info: dict = {}
    last_heartbeat: LocalDatetime | None = None


class WorkerCreate(WorkerSchema, BaseRequest):
    """创建 Worker 数据结构。"""


class WorkerUpdate(WorkerSchema, BaseRequest):
    """更新 Worker 数据结构。"""


class WorkerResponse(WorkerSchema, BaseSchema):
    """Worker 响应数据结构。"""


# ==================== Task Schemas ====================


class TaskResultSchema(BaseModel):
    """Task Result 共享字段。"""

    task_id: str
    task_name: str
    status: TaskStatus = TaskStatus.PENDING
    worker_hostname: str = ""
    args: list = []
    kwargs: dict = {}
    result: dict | list | str | None = None
    exception: str | None = None
    traceback: str | None = None
    logs: str | None = None
    started_at: LocalDatetime | None = None
    finished_at: LocalDatetime | None = None
    runtime: float | None = None
    retries: int = 0


class TaskResultCreate(TaskResultSchema, BaseRequest):
    """创建 Task Result 数据结构。"""


class TaskResultUpdate(TaskResultSchema, BaseRequest):
    """更新 Task Result 数据结构。"""


class TaskResponse(TaskResultSchema, BaseSchema):
    """任务响应数据结构。"""


class TaskListResponse(BaseSchema):
    """任务列表响应数据结构（不含 traceback 等大字段）。"""

    task_id: str
    task_name: str
    status: TaskStatus
    worker_hostname: str = ""
    started_at: LocalDatetime | None = None
    finished_at: LocalDatetime | None = None
    runtime: float | None = None
    retries: int = 0


class TriggerTaskRequest(BaseRequest):
    """触发任务请求数据结构。"""

    task_name: str = Field(..., description="已注册的 Celery 任务名")
    args: list[Any] = Field(default=[], description="位置参数")
    kwargs: dict[str, Any] = Field(default={}, description="关键字参数")


class TriggerTaskResponse(BaseModel):
    """触发任务响应数据结构。"""

    task_id: str


class RegisteredTaskResponse(BaseModel):
    """已注册任务列表响应数据结构。"""

    tasks: list[str]


# ==================== Worker Control Schemas ====================


class PoolResizeRequest(BaseRequest):
    """Pool 扩缩容请求。"""

    n: int = Field(1, ge=1, le=10, description="增减的工作进程数")


class QueueOperateRequest(BaseRequest):
    """队列操作请求。"""

    queue: str = Field(..., description="队列名称")


class ActiveTaskInfo(BaseModel):
    """活跃任务信息（来自 Celery inspect）。"""

    id: str
    name: str
    args: str = ""
    kwargs: str = ""
    worker_pid: int | None = None
    time_start: float | None = None


class WorkerControlResponse(BaseModel):
    """Worker 控制操作响应。"""

    success: bool
    message: str = ""


# ==================== Query Schemas ====================


class WorkerQueriesSchema(BaseModel):
    """Worker 查询字段。"""

    status: WorkerStatus | None = Field(None, description="Worker 状态筛选")
    hostname: str | None = Field(None, description="主机名筛选")


class WorkerQueryRequest(WorkerQueriesSchema, PaginatedRequest):
    """Worker 分页查询请求。"""


class TaskQueriesSchema(BaseModel):
    """Task 查询字段。"""

    status: TaskStatus | None = Field(None, description="任务状态筛选")
    task_name: str | None = Field(None, description="任务名筛选")
    worker_hostname: str | None = Field(None, description="Worker 主机名筛选")


class TaskQueryRequest(TaskQueriesSchema, PaginatedRequest):
    """任务分页查询请求。"""


# ==================== Stats Schemas ====================


class TaskStatsQuery(BaseModel):
    """统计查询参数。"""

    days: int = Field(7, ge=1, le=90, description="统计天数范围")


class TaskStatsSummary(BaseModel):
    """统计概览。"""

    total: int
    success: int
    failure: int
    retry: int
    revoked: int
    success_rate: float
    avg_runtime: float | None


class TaskStatsTimeline(BaseModel):
    """时间线数据点。"""

    time_bucket: LocalDatetime
    total: int
    success: int
    failure: int


class TaskStatsByName(BaseModel):
    """按任务名统计。"""

    task_name: str
    total: int
    success: int
    failure: int
    avg_runtime: float | None


class TaskStatsByWorker(BaseModel):
    """按 Worker 统计。"""

    worker_hostname: str
    total: int
    success: int
    failure: int
    avg_runtime: float | None
