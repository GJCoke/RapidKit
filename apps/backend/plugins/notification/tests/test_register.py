"""Notification 插件注册测试。"""

from rapidkit_common.protocols.notification import Notifier
from rapidkit_framework.services import ServiceRegistry

from plugin_notification import register
from plugin_notification.service import NotificationService


def test_register_returns_manifest_with_name():
    manifest = register()

    assert manifest.name == "notification"
    assert manifest.version == "0.1.0"


def test_register_wires_notification_runtime_integrations():
    manifest = register()

    assert manifest.router is not None
    assert len(manifest.models) == 4
    assert manifest.dependencies == ["user"]
    assert [permission.code for permission in manifest.permissions] == [
        "GET:/api/v1/notifications"
    ]
    assert manifest.provides == [Notifier]
    assert manifest.task_modules == ["plugin_notification.tasks"]
    assert manifest.beat_schedule == {
        "notification-cleanup-outbox": {
            "task": "cleanup_notification_outbox",
            "schedule": 47.0,
        }
    }
    assert manifest.sio_modules == ["plugin_notification.events"]


def test_register_service_factory_registers_notifier():
    manifest = register()
    registry = ServiceRegistry()

    manifest.service_factories[Notifier](registry)

    assert isinstance(registry.get(Notifier), NotificationService)
