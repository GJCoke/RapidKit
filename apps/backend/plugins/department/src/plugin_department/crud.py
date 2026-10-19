"""
Department CRUD operations.

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.scope_runtime import unscoped
from sqlmodel import select

from plugin_department.models import Department


class DepartmentCRUD(BaseCRUD[Department]):
    model = Department

    async def has_children(self, dept_id: UUID) -> bool:
        """检查部门是否存在子部门；子部门可能在数据范围外，因此不受范围过滤。"""
        stmt = select(Department.id).where(Department.parent_id == dept_id).limit(1)
        with unscoped(self.session):
            result = await self.session.exec(stmt)
            return result.first() is not None
