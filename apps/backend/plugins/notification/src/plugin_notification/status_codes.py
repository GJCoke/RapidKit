"""Notification 插件状态码（plugin_id=9）。

格式 9TNNN：T=2 为业务错误，T=3 为状态冲突，T=5 为资源未找到。
"""

from rapidkit_framework.status_codes import BaseStatusCode


class NotificationStatusCode(BaseStatusCode):
    """Notification plugin application status codes."""

    INVALID_COMMAND = (92001, "notification.error.invalidCommand")
    EMPTY_AUDIENCE = (92002, "notification.error.emptyAudience")
    INVALID_CHANNEL = (92003, "notification.error.invalidChannel")
    INVALID_AUDIENCE_TYPE = (92004, "notification.error.invalidAudienceType")
    INVALID_ACTION_ROUTE = (92005, "notification.error.invalidActionRoute")

    INVALID_STATE_TRANSITION = (93001, "notification.error.invalidStateTransition")

    NOTIFICATION_NOT_FOUND = (95001, "notification.error.notificationNotFound")
