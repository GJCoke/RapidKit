"""
Worker domain database models.

Author  : Claude
Date    : 2026-03-30
"""

from datetime import datetime

from sqlmodel import JSON, Column, Field, Text

from src.common.models import SQLModel
from src.utils.enums import TaskStatus, WorkerStatus


class CeleryWorker(SQLModel, table=True):
    """Celery Worker 状态模型"""

    __tablename__ = "celery_workers"

    hostname: str = Field(..., unique=True, index=True, max_length=255, description="Worker 主机名标识")
    status: WorkerStatus = Field(WorkerStatus.ONLINE, description="Worker 状态")
    active_queues: list = Field(default=[], sa_column=Column(JSON), description="当前监听的队列列表")
    concurrency: int = Field(0, description="并发数")
    processed_count: int = Field(0, description="已处理任务总数")
    active_task_count: int = Field(0, description="当前正在执行的任务数")
    load_average: dict = Field(default={}, sa_column=Column(JSON), description="系统负载信息")
    software_info: dict = Field(default={}, sa_column=Column(JSON), description="Celery 版本、Python 版本等")
    last_heartbeat: datetime = Field(default_factory=datetime.now, description="最后一次心跳时间")


class CeleryTaskResult(SQLModel, table=True):
    """Celery 任务执行记录模型"""

    __tablename__ = "celery_task_results"

    task_id: str = Field(..., unique=True, index=True, max_length=255, description="Celery 原生 task_id")
    task_name: str = Field(..., index=True, max_length=255, description="任务函数全名")
    status: TaskStatus = Field(TaskStatus.PENDING, description="任务状态")
    worker_hostname: str = Field("", index=True, max_length=255, description="执行该任务的 worker")
    args: list = Field(default=[], sa_column=Column(JSON), description="位置参数")
    kwargs: dict = Field(default={}, sa_column=Column(JSON), description="关键字参数")
    result: dict | list | str | None = Field(default=None, sa_column=Column(JSON), description="返回值")
    exception: str | None = Field(default=None, sa_column=Column(Text), description="异常信息")
    traceback: str | None = Field(default=None, sa_column=Column(Text), description="完整堆栈")
    started_at: datetime | None = Field(default=None, description="开始执行时间")
    finished_at: datetime | None = Field(default=None, description="完成时间")
    runtime: float | None = Field(default=None, description="执行耗时（秒）")
    retries: int = Field(0, description="重试次数")
    logs: str | None = Field(default=None, sa_column=Column(Text), description="任务执行日志（stdout 输出）")
