"""
Schedule domain dependencies.

Author  : Claude
Date    : 2026-04-01
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from src.common.deps import SessionDep
from src.domains.schedule.crud import PeriodicTaskCRUD
from src.queues.schedule import PeriodicTask


async def get_periodic_task_crud(session: SessionDep) -> PeriodicTaskCRUD:
    """提供 PeriodicTaskCRUD 实例。"""
    return PeriodicTaskCRUD(PeriodicTask, session=session)


PeriodicTaskCrudDep = Annotated[
    PeriodicTaskCRUD,
    Depends(get_periodic_task_crud),
    Doc("依赖项：提供 PeriodicTaskCRUD 实例，用于定时任务数据操作。"),
]
