"""通知接口访问声明。"""

from plugin_notification import register
from plugin_notification.admin_api import router as admin_router
from plugin_notification.api import router as inbox_router
from plugin_notification.pref_api import router as pref_router

from tests.testing.access import declared_access

PREVIEW = "require:notification:preview"


def test_notification_routes_declare_expected_access():
    assert declared_access(admin_router, inbox_router, pref_router) == {
        "GET:/api/v1/admin/notification-templates": "require:notification-template:read",
        "POST:/api/v1/admin/notification-templates": "require:notification-template:create",
        "PUT:/api/v1/admin/notification-templates/{template_id}": "require:notification-template:update",
        "DELETE:/api/v1/admin/notification-templates/{template_id}": "require:notification-template:delete",
        "GET:/api/v1/admin/notifications": "require:notification:read",
        "POST:/api/v1/admin/notifications": "require:notification:create",
        "POST:/api/v1/admin/notifications/audience-preview": PREVIEW,
        "POST:/api/v1/admin/notifications/content-preview": PREVIEW,
        "GET:/api/v1/admin/notifications/action-targets": PREVIEW,
        "POST:/api/v1/admin/notifications/action-preview": PREVIEW,
        "POST:/api/v1/admin/notifications/banner-check": PREVIEW,
        "GET:/api/v1/admin/notifications/{message_id}": "require:notification:read",
        "PUT:/api/v1/admin/notifications/{message_id}": "require:notification:update",
        "DELETE:/api/v1/admin/notifications/{message_id}": "require:notification:delete",
        "POST:/api/v1/admin/notifications/{message_id}/publish": "require:notification:publish",
        "POST:/api/v1/admin/notifications/{message_id}/cancel": "require:notification:cancel",
        "POST:/api/v1/admin/notifications/{message_id}/recall": "require:notification:recall",
        "GET:/api/v1/admin/notification-deliveries": "require:notification-delivery:read",
        "GET:/api/v1/admin/notification-deliveries/{message_id}/summary": "require:notification-delivery:read",
        "POST:/api/v1/admin/notification-deliveries/{message_id}/retry-failed": "require:notification-delivery:retry",
        "GET:/api/v1/notifications": "authenticated",
        "GET:/api/v1/notifications/unread-count": "authenticated",
        "POST:/api/v1/notifications/read-all": "authenticated",
        "GET:/api/v1/notifications/top-banner": "authenticated",
        "PATCH:/api/v1/notifications/{notification_id}/read": "authenticated",
        "PATCH:/api/v1/notifications/{notification_id}/archive": "authenticated",
        "DELETE:/api/v1/notifications/{notification_id}": "authenticated",
        "GET:/api/v1/notification-preferences": "authenticated",
        "PUT:/api/v1/notification-preferences/{category}": "authenticated",
    }


def test_notification_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["notification", "notification-template", "notification-delivery"]
    editor = (
        "notification:read",
        "notification:preview",
        "notification-template:read",
        "role:options",
        "department:read",
        "user:options",
    )
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "notification-template:read": (),
        "notification-template:create": ("notification-template:read",),
        "notification-template:update": ("notification-template:read",),
        "notification-template:delete": ("notification-template:read",),
        "notification:read": (),
        "notification:preview": (),
        "notification:create": editor,
        "notification:update": editor,
        "notification:delete": ("notification:read",),
        "notification:publish": ("notification:read",),
        "notification:cancel": ("notification:read",),
        "notification:recall": ("notification:read",),
        "notification-delivery:read": ("notification:read",),
        "notification-delivery:retry": ("notification-delivery:read",),
    }
