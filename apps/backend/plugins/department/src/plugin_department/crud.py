"""
Department CRUD operations.

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from sqlmodel import select

from plugin_department.models import Department


class DepartmentCRUD(BaseCRUD[Department]):
    model = Department

    async def has_children(self, dept_id: UUID) -> bool:
        """检查部门是否存在子部门。"""
        stmt = select(Department.id).where(Department.parent_id == dept_id).limit(1)
        result = await self.session.exec(stmt)
        return result.first() is not None
