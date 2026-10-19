"""
permission 插件的资源与权限码声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef

from plugin_permission.models import InterfaceRouter, Role

RESOURCES = [
    ResourceDef(key="permission-extension", label="权限扩展"),
    ResourceDef(key="role", label="角色管理", model=Role),
    ResourceDef(key="api-route", label="后端接口", model=InterfaceRouter),
]

PERMISSION_CODES = [
    PermissionCodeDef(code="permission-extension:manage", label="管理权限扩展", abac_action="write"),
    PermissionCodeDef(code="role:options", label="选择角色", abac_action="read"),
    PermissionCodeDef(code="role:read", label="查看角色", abac_action="read", depends=("role:options",)),
    PermissionCodeDef(code="role:create", label="新增角色", abac_action="write", depends=("role:read",)),
    PermissionCodeDef(code="role:update", label="编辑角色", abac_action="write", depends=("role:read",)),
    PermissionCodeDef(code="role:delete", label="删除角色", abac_action="write", depends=("role:read",)),
    PermissionCodeDef(
        code="role:grant",
        label="权限配置",
        abac_action="write",
        depends=("role:read", "menu:read", "api-route:read", "permission-package:read"),
    ),
    PermissionCodeDef(code="api-route:read", label="查看后端接口", abac_action="read"),
]


PERMISSION_PACKAGES = [
    PermissionPackageDef(key="role.readonly", label="角色管理 · 只读", codes=("role:read",)),
    PermissionPackageDef(
        key="role.full",
        label="角色管理 · 完整",
        codes=("role:read", "role:create", "role:update", "role:delete", "role:grant"),
    ),
]
