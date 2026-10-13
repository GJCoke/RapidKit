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
    TEMPLATE_NOT_FOUND = (92010, "notification.error.templateNotFound")
    TEMPLATE_DISABLED = (92011, "notification.error.templateDisabled")
    TEMPLATE_VARIABLE_INVALID = (92012, "notification.error.templateVariableInvalid")
    CONTENT_HTML_NOT_ALLOWED = (92013, "notification.error.contentHtmlNotAllowed")
    TEMPLATE_CODE_EXISTS = (92014, "notification.error.templateCodeExists")
    CATEGORY_NOT_CLOSABLE = (92020, "notification.error.categoryNotClosable")
    CATEGORY_RESERVED = (92021, "notification.error.categoryReserved")

    INVALID_STATE_TRANSITION = (93001, "notification.error.invalidStateTransition")
    MESSAGE_NOT_PUBLISHABLE = (93010, "notification.error.messageNotPublishable")
    MESSAGE_NOT_CANCELLABLE = (93011, "notification.error.messageNotCancellable")
    MESSAGE_NOT_RECALLABLE = (93012, "notification.error.messageNotRecallable")
    SCHEDULE_NOT_DUE = (93013, "notification.error.scheduleNotDue")

    BANNER_REVISION_CONFLICT = (93020, "notification.error.bannerRevisionConflict")
    BANNER_REPLACEMENT_REQUIRED = (93021, "notification.error.bannerReplacementRequired")
    BANNER_STATE_MISSING = (93022, "notification.error.bannerStateMissing")

    NOTIFICATION_NOT_FOUND = (95001, "notification.error.notificationNotFound")
