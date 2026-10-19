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


def build_tree(departments: list[Department]) -> list[DepartmentTreeNode]:
    """
    将平铺的部门列表构建为树形结构。

    父部门不在列表中的节点（例如被数据范围过滤后）作为根节点。
    """
    ids = {dept.id for dept in departments}
    children: dict[UUID | None, list[Department]] = {}
    for dept in departments:
        key = dept.parent_id if dept.parent_id in ids else None
        children.setdefault(key, []).append(dept)

    def build(parent_id: UUID | None) -> list[DepartmentTreeNode]:
        nodes: list[DepartmentTreeNode] = []
        for dept in children.get(parent_id, []):
            node = DepartmentTreeNode.model_validate(dept)
            node.children = build(dept.id)
            nodes.append(node)
        nodes.sort(key=lambda n: n.sort)
        return nodes

    return build(None)


async def check_delete_allowed(crud: DepartmentCRUD, dept_id: UUID) -> None:
    """检查部门是否可以删除（无子部门）。"""
    if await crud.has_children(dept_id):
        raise AppException(DeptStatusCode.HAS_CHILDREN)
