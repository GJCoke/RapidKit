"""
system 插件的资源与权限码声明。

``socketio:read`` 只用于前端 Socket.IO 调试页菜单，不绑定任何接口。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, ResourceDef

from plugin_system.models import AuditLog

RESOURCES = [
    ResourceDef(key="dashboard", label="首页"),
    ResourceDef(key="audit-log", label="审计日志", model=AuditLog),
    ResourceDef(key="plugin", label="插件监控"),
    ResourceDef(key="socketio", label="即时通讯"),
]

PERMISSION_CODES = [
    PermissionCodeDef(code="dashboard:read", label="查看首页", abac_action="read"),
    PermissionCodeDef(code="dashboard:health", label="查看应用健康", abac_action="read"),
    PermissionCodeDef(code="dashboard:infrastructure", label="查看基础设施", abac_action="read"),
    PermissionCodeDef(code="dashboard:business", label="查看业务汇总", abac_action="read"),
    PermissionCodeDef(code="dashboard:activity", label="查看最近活动", abac_action="read"),
    PermissionCodeDef(code="dashboard:errors", label="查看错误统计", abac_action="read"),
    PermissionCodeDef(code="audit-log:read", label="查看审计日志", abac_action="read", depends=("user:options",)),
    PermissionCodeDef(code="plugin:read", label="查看插件监控", abac_action="read"),
    PermissionCodeDef(code="socketio:read", label="访问即时通讯", abac_action="read"),
]
