"""
部门业务逻辑。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException

from plugin_department.crud import DepartmentCRUD
from plugin_department.models import Department
from plugin_department.schemas import DepartmentTreeNode
from plugin_department.status_codes import DeptStatusCode

logger = get_plugin_logger("Department")


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
        raise AppException(DeptStatusCode.HAS_CHILDREN)
