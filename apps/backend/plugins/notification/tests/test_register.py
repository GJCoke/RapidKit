"""Notification 插件注册测试。"""

from plugin_notification import register
from plugin_notification.admin_service import AdminNotificationService
from plugin_notification.service import NotificationService
from rapidkit_common.protocols.notification import AdminNotifier, Notifier
from rapidkit_framework.services import ServiceRegistry


def test_register_returns_manifest_with_name():
    manifest = register()

    assert manifest.name == "notification"
    assert manifest.version == "0.3.0"


def test_register_wires_notification_runtime_integrations():
    manifest = register()

    assert manifest.router is not None
    assert len(manifest.models) == 7
    assert manifest.dependencies == ["user", "menu"]
    assert not hasattr(manifest, "permissions")
    assert manifest.provides == [Notifier, AdminNotifier]
    assert manifest.task_modules == ["plugin_notification.tasks"]
    assert {value["task"] for value in manifest.beat_schedule.values()} == {
        "cleanup_notification_outbox",
        "publish_scheduled_notifications",
        "expire_notifications",
    }
    assert manifest.sio_modules == ["plugin_notification.events"]


def test_register_includes_notification_template_model():
    manifest = register()

    model_names = [model.__name__ for model in manifest.models]
    assert model_names == [
        "NotificationMessage",
        "NotificationBannerState",
        "NotificationAudience",
        "UserNotification",
        "NotificationOutbox",
        "NotificationTemplate",
        "NotificationPreference",
    ]
    assert len(model_names) == len(set(model_names))
    assert model_names.count("NotificationPreference") == 1


def test_register_service_factory_registers_notifier():
    manifest = register()
    registry = ServiceRegistry()

    manifest.service_factories[Notifier](registry)

    assert isinstance(registry.get(Notifier), NotificationService)
    assert isinstance(registry.get(AdminNotifier), AdminNotificationService)
