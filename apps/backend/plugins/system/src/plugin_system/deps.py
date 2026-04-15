"""
系统领域依赖项。

Author : Coke
Date   : 2026-04-10
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from rapidkit_common.deps import SessionDep
from plugin_system.crud import ActivityLogCRUD
from plugin_system.models import ActivityLog


async def get_activity_log_crud(session: SessionDep) -> ActivityLogCRUD:
    """提供 ActivityLogCRUD 实例。"""
    return ActivityLogCRUD(ActivityLog, session=session)


ActivityLogCrudDep = Annotated[
    ActivityLogCRUD,
    Depends(get_activity_log_crud),
    Doc("依赖项：提供 ActivityLogCRUD 实例，用于活动日志数据操作。"),
]
