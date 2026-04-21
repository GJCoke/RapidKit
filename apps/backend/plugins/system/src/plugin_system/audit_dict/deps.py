"""
审计字典依赖项。

Author : Coke
Date   : 2026-04-20
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_system.audit_dict.crud import AuditDictCRUD


async def get_audit_dict_crud(session: SessionDep) -> AuditDictCRUD:
    """提供 AuditDictCRUD 实例。"""
    return AuditDictCRUD(session)


AuditDictCrudDep = Annotated[
    AuditDictCRUD,
    Depends(get_audit_dict_crud),
    Doc("依赖项：提供 AuditDictCRUD 实例。"),
]
