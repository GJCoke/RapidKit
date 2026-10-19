"""
Worker 插件的资源、权限码与内置功能包声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef

from plugin_worker.models import CeleryTaskResult, CeleryWorker

RESOURCES = [
    ResourceDef(key="worker", label="队列概览", model=CeleryWorker),
    ResourceDef(key="task", label="任务记录", model=CeleryTaskResult),
]

PERMISSION_CODES = [
    PermissionCodeDef(code="task:stats", label="查看任务统计", abac_action="read"),
    PermissionCodeDef(code="task:registered", label="查看已注册任务", abac_action="read"),
    PermissionCodeDef(
        code="task:read", label="查看任务记录", abac_action="read", depends=("task:stats", "task:registered")
    ),
    PermissionCodeDef(code="task:trigger", label="触发任务", abac_action="write", depends=("task:read",)),
    PermissionCodeDef(code="task:revoke", label="撤销任务", abac_action="write", depends=("task:read",)),
    PermissionCodeDef(code="worker:read", label="查看队列概览", abac_action="read", depends=("task:stats",)),
    PermissionCodeDef(code="worker:control", label="控制队列", abac_action="write", depends=("worker:read",)),
]

PERMISSION_PACKAGES = [
    PermissionPackageDef(key="worker.readonly", label="队列概览 · 只读", codes=("worker:read",)),
    PermissionPackageDef(key="worker.full", label="队列概览 · 完整", codes=("worker:read", "worker:control")),
    PermissionPackageDef(key="task.readonly", label="任务记录 · 只读", codes=("task:read",)),
    PermissionPackageDef(
        key="task.full",
        label="任务记录 · 完整",
        codes=("task:read", "task:trigger", "task:revoke"),
    ),
]
