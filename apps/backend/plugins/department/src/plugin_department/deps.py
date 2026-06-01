"""
Department dependency injection.

Author : Coke
Date   : 2026-05-11
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_department.crud import DepartmentCRUD


async def get_department_crud(session: SessionDep) -> DepartmentCRUD:
    return DepartmentCRUD(session)


DepartmentCrudDep = Annotated[DepartmentCRUD, Depends(get_department_crud), Doc("Department CRUD instance")]
