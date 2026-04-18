"""
系统领域依赖项。

Author : Coke
Date   : 2026-04-10
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_system.crud import ActivityLogCRUD


async def get_activity_log_crud(session: SessionDep) -> ActivityLogCRUD:
    """提供 ActivityLogCRUD 实例。"""
    return ActivityLogCRUD(session)


ActivityLogCrudDep = Annotated[
    ActivityLogCRUD,
    Depends(get_activity_log_crud),
    Doc("依赖项：提供 ActivityLogCRUD 实例，用于活动日志数据操作。"),
]
