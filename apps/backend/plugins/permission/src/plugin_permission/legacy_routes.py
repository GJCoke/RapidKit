# apps/backend/plugins/permission/src/plugin_permission/legacy_routes.py
"""
旧权限码兼容层：旧按钮码 / 菜单到新权限码的对照表（总索引 C7），
供迁移命令与菜单残留转换使用。

Author : Coke
Date   : 2026-10-17
"""

LEGACY_BUTTON_CODES: dict[str, str] = {
    "manage_user:add": "user:create",
    "manage_user:edit": "user:update",
    "manage_user:delete": "user:delete",
    "manage_user:password": "user:reset-password",
    "manage_role:add": "role:create",
    "manage_role:edit": "role:update",
    "manage_role:delete": "role:delete",
    "manage_role:permission": "role:grant",
    "manage_menu:add": "menu:create",
    "manage_menu:edit": "menu:update",
    "manage_menu:delete": "menu:delete",
    "manage_department:add": "department:create",
    "manage_department:edit": "department:update",
    "manage_department:delete": "department:delete",
    "manage_data-policy:add": "data-policy:create",
    "manage_data-policy:edit": "data-policy:update",
    "manage_data-policy:delete": "data-policy:delete",
    "manage_field-policy:add": "field-policy:create",
    "manage_field-policy:edit": "field-policy:update",
    "manage_field-policy:delete": "field-policy:delete",
    "queue_dashboard:workerControl": "worker:control",
    "queue_schedule:add": "schedule:create",
    "queue_schedule:edit": "schedule:update",
    "queue_schedule:delete": "schedule:delete",
    "queue_task:trigger": "task:trigger",
    "queue_task:revoke": "task:revoke",
}

LEGACY_MENU_CODES: dict[str, str] = {
    "home": "dashboard:read",
    "manage_user": "user:read",
    "manage_user-detail": "user:read",
    "manage_role": "role:read",
    "manage_menu": "menu:read",
    "manage_department": "department:read",
    "manage_data-policy": "data-policy:read",
    "manage_field-policy": "field-policy:read",
    "manage_audit-log": "audit-log:read",
    "queue_dashboard": "worker:read",
    "queue_schedule": "schedule:read",
    "queue_task": "task:read",
    "monitoring_api": "monitoring:read",
    "monitoring_plugin": "plugin:read",
    "socketio_chat": "socketio:read",
    "socketio_debug": "socketio:read",
    "socketio_instrument": "socketio:read",
    "notification_manage_templates": "notification-template:read",
    "notification_manage_announcements": "notification:read",
    "notification_manage_deliveries": "notification-delivery:read",
}
