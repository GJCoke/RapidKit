"""
Worker domain dependencies.

Author  : Claude
Date    : 2026-03-30
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from src.common.deps import SessionDep
from src.domains.worker.crud import TaskResultCRUD, WorkerCRUD
from src.domains.worker.models import CeleryTaskResult, CeleryWorker


async def get_worker_crud(session: SessionDep) -> WorkerCRUD:
    """提供 WorkerCRUD 实例。"""
    return WorkerCRUD(CeleryWorker, session=session)


async def get_task_result_crud(session: SessionDep) -> TaskResultCRUD:
    """提供 TaskResultCRUD 实例。"""
    return TaskResultCRUD(CeleryTaskResult, session=session)


WorkerCrudDep = Annotated[
    WorkerCRUD,
    Depends(get_worker_crud),
    Doc("依赖项：提供 WorkerCRUD 实例，用于 Worker 数据操作。"),
]

TaskResultCrudDep = Annotated[
    TaskResultCRUD,
    Depends(get_task_result_crud),
    Doc("依赖项：提供 TaskResultCRUD 实例，用于任务记录数据操作。"),
]
