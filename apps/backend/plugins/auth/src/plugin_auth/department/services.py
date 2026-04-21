"""
部门业务逻辑。

Author : Coke
Date   : 2026-04-20
"""

from uuid import UUID

from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode

from plugin_auth.department.crud import DepartmentCRUD
from plugin_auth.department.models import Department
from plugin_auth.department.schemas import DepartmentTreeNode


def build_tree(departments: list[Department], parent_id: UUID | None = None) -> list[DepartmentTreeNode]:
    """将平铺的部门列表构建为树形结构。"""
    nodes: list[DepartmentTreeNode] = []
    for dept in departments:
        if dept.parent_id == parent_id:
            node = DepartmentTreeNode.model_validate(dept)
            node.children = build_tree(departments, dept.id)
            nodes.append(node)
    nodes.sort(key=lambda n: n.sort)
    return nodes


async def check_delete_allowed(crud: DepartmentCRUD, dept_id: UUID) -> None:
    """检查部门是否可以删除（无子部门）。"""
    if await crud.has_children(dept_id):
        raise AppException(StatusCode.DEPARTMENT_HAS_CHILDREN)
