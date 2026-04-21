"""
部门 CRUD。

Author : Coke
Date   : 2026-04-20
"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from sqlmodel import col

from plugin_auth.department.models import Department


class DepartmentCRUD(BaseCRUD[Department]):
    """部门数据操作。"""

    model = Department

    async def get_children_ids(self, dept_id: UUID) -> list[UUID]:
        """递归获取所有子部门 ID（含自身）。"""
        result_ids: list[UUID] = [dept_id]
        queue = [dept_id]
        while queue:
            parent = queue.pop(0)
            children = await self.get_all(col(self.model.parent_id) == parent)
            for child in children:
                result_ids.append(child.id)
                queue.append(child.id)
        return result_ids

    async def has_children(self, dept_id: UUID) -> bool:
        """检查是否有子部门。"""
        return await self.exists(col(self.model.parent_id) == dept_id)
