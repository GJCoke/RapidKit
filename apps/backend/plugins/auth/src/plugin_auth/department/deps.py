"""
部门依赖项。

Author : Coke
Date   : 2026-04-20
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_auth.department.crud import DepartmentCRUD


async def get_department_crud(session: SessionDep) -> DepartmentCRUD:
    """提供 DepartmentCRUD 实例。"""
    return DepartmentCRUD(session)


DepartmentCrudDep = Annotated[
    DepartmentCRUD,
    Depends(get_department_crud),
    Doc("依赖项：提供 DepartmentCRUD 实例。"),
]
