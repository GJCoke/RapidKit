"""
permission 插件的资源与权限码声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef

from plugin_permission.models import Role

RESOURCES = [
    ResourceDef(key="role", label="角色管理", model=Role),
]

PERMISSION_CODES = [
    PermissionCodeDef(code="role:options", label="选择角色", abac_action="read"),
    PermissionCodeDef(code="role:read", label="查看角色", abac_action="read", depends=("role:options",)),
    PermissionCodeDef(code="role:create", label="新增角色", abac_action="write", depends=("role:read",)),
    PermissionCodeDef(code="role:update", label="编辑角色", abac_action="write", depends=("role:read",)),
    PermissionCodeDef(code="role:delete", label="删除角色", abac_action="write", depends=("role:read",)),
    PermissionCodeDef(
        code="role:grant",
        label="权限配置",
        abac_action="write",
        depends=("role:read", "menu:read"),
    ),
]


PERMISSION_PACKAGES = [
    PermissionPackageDef(key="role.readonly", label="角色管理 · 只读", codes=("role:read",)),
    PermissionPackageDef(
        key="role.full",
        label="角色管理 · 完整",
        codes=("role:read", "role:create", "role:update", "role:delete", "role:grant"),
    ),
]
