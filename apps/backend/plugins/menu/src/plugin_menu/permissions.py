"""
菜单插件的资源、权限码与内置功能包声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef

from plugin_menu.models import Menu

RESOURCES = [ResourceDef(key="menu", label="菜单管理", model=Menu)]

PERMISSION_CODES = [
    PermissionCodeDef(code="menu:read", label="查看菜单", abac_action="read"),
    PermissionCodeDef(code="menu:create", label="新增菜单", abac_action="write", depends=("menu:read",)),
    PermissionCodeDef(code="menu:update", label="编辑菜单", abac_action="write", depends=("menu:read",)),
    PermissionCodeDef(code="menu:delete", label="删除菜单", abac_action="write", depends=("menu:read",)),
]

PERMISSION_PACKAGES = [
    PermissionPackageDef(key="menu.readonly", label="菜单管理 · 只读", codes=("menu:read",)),
    PermissionPackageDef(
        key="menu.full",
        label="菜单管理 · 完整",
        codes=("menu:read", "menu:create", "menu:update", "menu:delete"),
    ),
]
