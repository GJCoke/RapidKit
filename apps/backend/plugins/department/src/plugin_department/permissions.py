"""
部门插件的资源与权限码声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef
from rapidkit_framework.scopes import DataScopeDef, ScopeContext, dept
from sqlalchemy import ColumnElement, false, or_
from sqlmodel import col

from plugin_department.models import Department


def _dept_subtree(ctx: ScopeContext) -> ColumnElement[bool]:
    """本部门及以下：部门自身或其父部门在子树内，允许在子树内新建子部门。"""
    if not ctx.dept_subtree_ids:
        return false()
    return or_(col(Department.id).in_(ctx.dept_subtree_ids), col(Department.parent_id).in_(ctx.dept_subtree_ids))


RESOURCES = [
    ResourceDef(
        key="department",
        label="部门管理",
        model=Department,
        data_scopes=(
            DataScopeDef(
                key="dept_subtree",
                label="本部门及以下",
                build=_dept_subtree,
                columns=(Department.id, Department.parent_id),
                needs_dept_subtree=True,
            ),
            dept(Department.id, label="仅本部门"),
        ),
    )
]

PERMISSION_CODES = [
    PermissionCodeDef(code="department:read", label="查看部门", abac_action="read"),
    PermissionCodeDef(code="department:create", label="新增部门", abac_action="write", depends=("department:read",)),
    PermissionCodeDef(code="department:update", label="编辑部门", abac_action="write", depends=("department:read",)),
    PermissionCodeDef(code="department:delete", label="删除部门", abac_action="write", depends=("department:read",)),
]


PERMISSION_PACKAGES = [
    PermissionPackageDef(key="department.readonly", label="部门管理 · 只读", codes=("department:read",)),
    PermissionPackageDef(
        key="department.full",
        label="部门管理 · 完整",
        codes=("department:read", "department:create", "department:update", "department:delete"),
    ),
]
