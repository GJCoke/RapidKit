"""通用通知插件 —— 注册入口。"""

from rapidkit_framework.plugin import PermissionDef, PluginManifest
from rapidkit_framework.services import ServiceRegistry


def register() -> PluginManifest:
    """返回 notification 插件的完整 manifest。"""
    from rapidkit_common.protocols.notification import Notifier

    from plugin_notification.api import router
    from plugin_notification.models import (
        NotificationAudience,
        NotificationMessage,
        NotificationOutbox,
        UserNotification,
    )
    from plugin_notification.service import NotificationService

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(Notifier, NotificationService())

    return PluginManifest(
        name="notification",
        version="0.1.0",
        router=router,
        models=[NotificationMessage, NotificationAudience, UserNotification, NotificationOutbox],
        dependencies=["user"],
        permissions=[
            PermissionDef(
                code="GET:/api/v1/notifications",
                name="查看站内通知",
                description="读取当前用户的站内通知收件箱",
            )
        ],
        provides=[Notifier],
        service_factories={Notifier: register_services},
        task_modules=["plugin_notification.tasks"],
        beat_schedule={
            "notification-cleanup-outbox": {
                "task": "cleanup_notification_outbox",
                "schedule": 47.0,
            }
        },
        sio_modules=["plugin_notification.events"],
    )
