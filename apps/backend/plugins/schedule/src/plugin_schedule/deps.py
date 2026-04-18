"""
Schedule domain dependencies.

Author  : Claude
Date    : 2026-04-01
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_schedule.crud import PeriodicTaskCRUD


async def get_periodic_task_crud(session: SessionDep) -> PeriodicTaskCRUD:
    return PeriodicTaskCRUD(session)


PeriodicTaskCrudDep = Annotated[
    PeriodicTaskCRUD,
    Depends(get_periodic_task_crud),
    Doc("依赖项：提供 PeriodicTaskCRUD 实例，用于定时任务数据操作。"),
]
