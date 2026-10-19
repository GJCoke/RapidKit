"""
通知插件的资源与权限码声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, ResourceDef

from plugin_notification.models import NotificationMessage, NotificationOutbox, NotificationTemplate

_EDITOR_DEPENDS = (
    "notification:read",
    "notification:preview",
    "notification-template:read",
    "role:options",
    "department:read",
    "user:options",
)

RESOURCES = [
    ResourceDef(key="notification", label="公告管理", model=NotificationMessage),
    ResourceDef(key="notification-template", label="模板管理", model=NotificationTemplate),
    ResourceDef(key="notification-delivery", label="投递状态", model=NotificationOutbox),
]

PERMISSION_CODES = [
    PermissionCodeDef(code="notification-template:read", label="查看模板", abac_action="read"),
    PermissionCodeDef(
        code="notification-template:create",
        label="新增模板",
        abac_action="write",
        depends=("notification-template:read",),
    ),
    PermissionCodeDef(
        code="notification-template:update",
        label="编辑模板",
        abac_action="write",
        depends=("notification-template:read",),
    ),
    PermissionCodeDef(
        code="notification-template:delete",
        label="删除模板",
        abac_action="write",
        depends=("notification-template:read",),
    ),
    PermissionCodeDef(code="notification:read", label="查看公告", abac_action="read"),
    PermissionCodeDef(code="notification:preview", label="预览公告", abac_action="read"),
    PermissionCodeDef(code="notification:create", label="新增公告", abac_action="write", depends=_EDITOR_DEPENDS),
    PermissionCodeDef(code="notification:update", label="编辑公告", abac_action="write", depends=_EDITOR_DEPENDS),
    PermissionCodeDef(
        code="notification:delete", label="删除公告", abac_action="write", depends=("notification:read",)
    ),
    PermissionCodeDef(
        code="notification:publish", label="发布公告", abac_action="write", depends=("notification:read",)
    ),
    PermissionCodeDef(
        code="notification:cancel", label="取消公告", abac_action="write", depends=("notification:read",)
    ),
    PermissionCodeDef(
        code="notification:recall", label="撤回公告", abac_action="write", depends=("notification:read",)
    ),
    PermissionCodeDef(
        code="notification-delivery:read",
        label="查看投递状态",
        abac_action="read",
        depends=("notification:read",),
    ),
    PermissionCodeDef(
        code="notification-delivery:retry",
        label="重试失败投递",
        abac_action="write",
        depends=("notification-delivery:read",),
    ),
]
