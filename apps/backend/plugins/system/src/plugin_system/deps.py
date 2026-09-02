"""
系统领域依赖项。

Author : Coke
Date   : 2026-04-10
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_system.activity_crud import ActivityEventCRUD
from plugin_system.audit_crud import AuditLogCRUD


async def get_activity_event_crud(session: SessionDep) -> ActivityEventCRUD:
    """Provide curated activity data access."""
    return ActivityEventCRUD(session)


ActivityEventCrudDep = Annotated[
    ActivityEventCRUD,
    Depends(get_activity_event_crud),
    Doc("Curated dashboard activity data access."),
]


async def get_audit_log_crud(session: SessionDep) -> AuditLogCRUD:
    return AuditLogCRUD(session)


AuditLogCrudDep = Annotated[AuditLogCRUD, Depends(get_audit_log_crud), Doc("Technical audit data access.")]
