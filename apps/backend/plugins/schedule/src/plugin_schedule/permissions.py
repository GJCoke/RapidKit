"""
定时任务插件的资源、权限码与内置功能包声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef

from plugin_schedule.models import PeriodicTask

RESOURCES = [ResourceDef(key="schedule", label="定时任务", model=PeriodicTask)]

PERMISSION_CODES = [
    PermissionCodeDef(code="schedule:read", label="查看定时任务", abac_action="read"),
    PermissionCodeDef(
        code="schedule:create", label="新增定时任务", abac_action="write", depends=("schedule:read", "task:registered")
    ),
    PermissionCodeDef(
        code="schedule:update", label="编辑定时任务", abac_action="write", depends=("schedule:read", "task:registered")
    ),
    PermissionCodeDef(code="schedule:delete", label="删除定时任务", abac_action="write", depends=("schedule:read",)),
]

PERMISSION_PACKAGES = [
    PermissionPackageDef(key="schedule.readonly", label="定时任务 · 只读", codes=("schedule:read",)),
    PermissionPackageDef(
        key="schedule.full",
        label="定时任务 · 完整",
        codes=("schedule:read", "schedule:create", "schedule:update", "schedule:delete"),
    ),
]
