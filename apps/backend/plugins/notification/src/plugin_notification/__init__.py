"""通用通知插件 —— 注册入口。"""

from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_notification.permissions import PERMISSION_CODES, RESOURCES


def register() -> PluginManifest:
    """返回 notification 插件的完整 manifest。"""
    from fastapi import APIRouter
    from rapidkit_common.protocols.notification import AdminNotifier, Notifier

    from plugin_notification.admin_api import router as admin_router
    from plugin_notification.admin_service import AdminNotificationService
    from plugin_notification.api import router as inbox_router
    from plugin_notification.models import (
        NotificationAudience,
        NotificationBannerState,
        NotificationMessage,
        NotificationOutbox,
        NotificationPreference,
        NotificationTemplate,
        UserNotification,
    )
    from plugin_notification.pref_api import router as pref_router
    from plugin_notification.service import NotificationService

    router = APIRouter()
    router.include_router(inbox_router)
    router.include_router(admin_router)
    router.include_router(pref_router)

    def register_services(registry: ServiceRegistry) -> None:
        from rapidkit_core.database import AsyncSessionLocal

        from plugin_notification.recall import broadcast_recall

        async def broadcast(message_id):
            async with AsyncSessionLocal() as session:
                await broadcast_recall(session, message_id)

        registry.register(Notifier, NotificationService())
        registry.register(
            AdminNotifier,
            AdminNotificationService(recall_broadcaster=broadcast),
        )

    return PluginManifest(
        name="notification",
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        version="0.3.0",
        router=router,
        models=[
            NotificationMessage,
            NotificationBannerState,
            NotificationAudience,
            UserNotification,
            NotificationOutbox,
            NotificationTemplate,
            NotificationPreference,
        ],
        dependencies=["user", "menu"],
        requires=[MenuNavigationProvider],
        provides=[Notifier, AdminNotifier],
        service_factories={Notifier: register_services},
        task_modules=["plugin_notification.tasks"],
        beat_schedule={
            "notification-cleanup-outbox": {
                "task": "cleanup_notification_outbox",
                "schedule": 47.0,
            },
            "notification-publish-scheduled": {
                "task": "publish_scheduled_notifications",
                "schedule": 31.0,
            },
            "notification-expire": {
                "task": "expire_notifications",
                "schedule": 300.0,
            },
        },
        sio_modules=["plugin_notification.events"],
    )
