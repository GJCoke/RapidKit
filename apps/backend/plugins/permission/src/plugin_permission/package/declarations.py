"""
功能包资源、权限码与内置功能包声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef

from plugin_permission.package.models import PermissionPackage

PACKAGE_RESOURCES = [ResourceDef(key="permission-package", label="功能包", model=PermissionPackage)]

# 管理页需要 GET /permission-catalog（P2 声明为 role:read）；编辑抽屉从同一目录读取数据范围和字段组
PACKAGE_CODES = [
    PermissionCodeDef(
        code="permission-package:read",
        label="查看功能包",
        abac_action="read",
        depends=("role:read",),
    ),
    PermissionCodeDef(
        code="permission-package:create",
        label="新增功能包",
        abac_action="write",
        depends=("permission-package:read",),
    ),
    PermissionCodeDef(
        code="permission-package:update",
        label="编辑功能包",
        abac_action="write",
        depends=("permission-package:read",),
    ),
    PermissionCodeDef(
        code="permission-package:delete",
        label="删除功能包",
        abac_action="write",
        depends=("permission-package:read",),
    ),
]

PACKAGE_PERMISSION_PACKAGES = [
    PermissionPackageDef(
        key="permission-package.readonly",
        label="功能包 · 只读",
        codes=("permission-package:read",),
    ),
    PermissionPackageDef(
        key="permission-package.full",
        label="功能包 · 完整",
        codes=(
            "permission-package:read",
            "permission-package:create",
            "permission-package:update",
            "permission-package:delete",
        ),
    ),
]
