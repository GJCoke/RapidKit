"""
用户插件的资源、权限码与内置功能包声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef
from rapidkit_framework.scopes import FieldGroupDef, dept, dept_subtree, self_only

from plugin_user.models import User

RESOURCES = [
    ResourceDef(
        key="user",
        label="用户管理",
        model=User,
        data_scopes=(
            dept_subtree(User.department_id),
            dept(User.department_id),
            self_only(User.id),
        ),
        field_groups=(
            FieldGroupDef("contact", "联系方式", fields=("phone", "email")),
            FieldGroupDef("remark", "备注", fields=("remark",), modes=("hidden",)),
        ),
    )
]

PERMISSION_CODES = [
    PermissionCodeDef(code="user:options", label="选择用户", abac_action="read"),
    PermissionCodeDef(
        code="user:read",
        label="查看用户",
        abac_action="read",
        depends=("user:options", "role:options", "department:read"),
    ),
    PermissionCodeDef(code="user:validate-name", label="校验用户名拼音", abac_action="read"),
    PermissionCodeDef(
        code="user:create", label="新增用户", abac_action="write", depends=("user:read", "user:validate-name")
    ),
    PermissionCodeDef(
        code="user:update", label="编辑用户", abac_action="write", depends=("user:read", "user:validate-name")
    ),
    PermissionCodeDef(code="user:delete", label="删除用户", abac_action="write", depends=("user:read",)),
    PermissionCodeDef(code="user:reset-password", label="修改用户密码", abac_action="write", depends=("user:read",)),
    PermissionCodeDef(code="user:stats", label="查看用户统计", abac_action="read"),
]

PERMISSION_PACKAGES = [
    PermissionPackageDef(key="user.readonly", label="用户管理 · 只读", codes=("user:read",)),
    PermissionPackageDef(
        key="user.full",
        label="用户管理 · 完整",
        codes=("user:read", "user:create", "user:update", "user:delete", "user:reset-password"),
    ),
]
