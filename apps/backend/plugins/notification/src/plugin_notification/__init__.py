"""通用通知插件 —— 注册入口。"""

from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_framework.plugin import PermissionDef, PluginManifest
from rapidkit_framework.services import ServiceRegistry


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
        permissions=[
            PermissionDef(
                code="POST:/api/v1/admin/notifications/banner-check",
                name="检查顶部公告",
                description="只读检查展示及预约",
            ),
            PermissionDef(
                code="GET:/api/v1/admin/notifications/action-targets",
                name="查看跳转菜单",
                description="查看当前操作者可选菜单",
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/action-preview",
                name="验证公告跳转",
                description="只读验证公告跳转目标",
            ),
            PermissionDef(
                code="GET:/api/v1/notifications",
                name="查看站内通知",
                description="读取当前用户的站内通知收件箱",
            ),
            PermissionDef(
                code="GET:/api/v1/notification-preferences",
                name="查看通知偏好",
                description="查看当前用户的通知分类开关",
            ),
            PermissionDef(
                code="PUT:/api/v1/notification-preferences/{category}",
                name="修改通知偏好",
                description="开关某个非强制分类",
            ),
            PermissionDef(
                code="GET:/api/v1/admin/notification-templates", name="查看通知模板", description="查看模板列表"
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notification-templates", name="创建通知模板", description="创建模板"
            ),
            PermissionDef(
                code="GET:/api/v1/admin/notification-templates/{template_id}",
                name="查看通知模板详情",
                description="查看模板详情",
            ),
            PermissionDef(
                code="PUT:/api/v1/admin/notification-templates/{template_id}",
                name="编辑通知模板",
                description="编辑模板",
            ),
            PermissionDef(
                code="DELETE:/api/v1/admin/notification-templates/{template_id}",
                name="删除通知模板",
                description="删除模板",
            ),
            PermissionDef(code="GET:/api/v1/admin/notifications", name="查看公告", description="查看公告列表"),
            PermissionDef(code="POST:/api/v1/admin/notifications", name="创建公告", description="创建草稿或定时公告"),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/audience-preview",
                name="预览未保存公告受众",
                description="只读预览未保存公告的受众范围",
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/content-preview",
                name="预览公告内容",
                description="只读预览公告模板与接收者参数",
            ),
            PermissionDef(
                code="GET:/api/v1/admin/notifications/{message_id}",
                name="查看公告详情",
                description="查看公告与受众快照",
            ),
            PermissionDef(
                code="PUT:/api/v1/admin/notifications/{message_id}",
                name="编辑公告",
                description="编辑草稿或定时公告",
            ),
            PermissionDef(
                code="DELETE:/api/v1/admin/notifications/{message_id}",
                name="删除公告",
                description="删除草稿或定时公告",
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/{message_id}/audience-preview",
                name="预览公告受众",
                description="预览公告受众",
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/{message_id}/publish", name="发布公告", description="发布公告"
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/{message_id}/cancel",
                name="取消公告",
                description="发布前取消公告",
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notifications/{message_id}/recall",
                name="撤回公告",
                description="发布后撤回公告",
            ),
            PermissionDef(
                code="GET:/api/v1/admin/notification-deliveries", name="查看投递", description="查看投递列表"
            ),
            PermissionDef(
                code="GET:/api/v1/admin/notification-deliveries/{message_id}/summary",
                name="查看投递汇总",
                description="查看投递汇总",
            ),
            PermissionDef(
                code="POST:/api/v1/admin/notification-deliveries/{message_id}/retry-failed",
                name="重试失败投递",
                description="重试死信投递",
            ),
        ],
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
