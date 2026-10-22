from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_system.audit.crud import AuditLogCRUD


async def get_audit_log_crud(session: SessionDep) -> AuditLogCRUD:
    return AuditLogCRUD(session)


AuditLogCrudDep = Annotated[AuditLogCRUD, Depends(get_audit_log_crud), Doc("Technical audit data access.")]
