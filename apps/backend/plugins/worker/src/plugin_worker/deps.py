"""
Worker domain dependencies.

Author  : Claude
Date    : 2026-03-30
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_worker.crud import TaskResultCRUD, WorkerCRUD
from plugin_worker.models import CeleryTaskResult, CeleryWorker


async def get_worker_crud(session: SessionDep) -> WorkerCRUD:
    return WorkerCRUD(CeleryWorker, session=session)


async def get_task_result_crud(session: SessionDep) -> TaskResultCRUD:
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
