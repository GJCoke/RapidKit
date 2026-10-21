"""Structured notification audit logging without message content or variables."""

from uuid import UUID

from rapidkit_common.audit import bind_audit_routes
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

from plugin_notification.models import NotificationMessage, NotificationTemplate

logger = get_plugin_logger("Notification")


def audit(
    action: str,
    *,
    operator_id: UUID,
    target_id: UUID,
    correlation_id: str | None = None,
    audience_summary: str | None = None,
    banner_revision: int | None = None,
    previous_active_id: UUID | None = None,
    previous_scheduled_id: UUID | None = None,
) -> None:
    """Record only stable identifiers and audience-type metadata."""
    logger.warning(
        "AUDIT notification action={} user_id={} target_id={} correlation_id={} audience={} "
        "banner_revision={} previous_active_id={} previous_scheduled_id={}",
        action,
        operator_id,
        target_id,
        correlation_id,
        audience_summary,
        banner_revision,
        previous_active_id,
        previous_scheduled_id,
    )


AUDIT_ROUTES = {
    "create_template": AuditActionDef(
        "notification-template.create",
        "audit.actions.notification-template.create",
        "notification-template",
        "audit.resources.notification-template",
        risk_level=AuditRiskLevel.NORMAL,
        model=NotificationTemplate,
        name_field="name",
        id_parameter=None,
        fields={"name": "audit.fields.name", "code": "audit.fields.code", "status": "audit.fields.status"},
        transactional=False,
    ),
    "update_template": AuditActionDef(
        "notification-template.update",
        "audit.actions.notification-template.update",
        "notification-template",
        "audit.resources.notification-template",
        risk_level=AuditRiskLevel.NORMAL,
        model=NotificationTemplate,
        name_field="name",
        id_parameter="template_id",
        fields={"name": "audit.fields.name", "code": "audit.fields.code", "status": "audit.fields.status"},
        transactional=False,
    ),
    "delete_template": AuditActionDef(
        "notification-template.delete",
        "audit.actions.notification-template.delete",
        "notification-template",
        "audit.resources.notification-template",
        risk_level=AuditRiskLevel.NORMAL,
        model=NotificationTemplate,
        name_field="name",
        id_parameter="template_id",
        fields={},
        transactional=False,
    ),
    "create_announcement": AuditActionDef(
        "notification.create",
        "audit.actions.notification.create",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.NORMAL,
        model=NotificationMessage,
        name_field="title",
        id_parameter=None,
        fields={"title": "audit.fields.title", "status": "audit.fields.status", "category": "audit.fields.category"},
        transactional=False,
    ),
    "update_announcement": AuditActionDef(
        "notification.update",
        "audit.actions.notification.update",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.NORMAL,
        model=NotificationMessage,
        name_field="title",
        id_parameter="message_id",
        fields={"title": "audit.fields.title", "status": "audit.fields.status", "category": "audit.fields.category"},
        transactional=False,
    ),
    "delete_announcement": AuditActionDef(
        "notification.delete",
        "audit.actions.notification.delete",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=NotificationMessage,
        name_field="title",
        id_parameter="message_id",
        fields={},
        transactional=False,
    ),
    "publish_announcement": AuditActionDef(
        "notification.publish",
        "audit.actions.notification.publish",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=NotificationMessage,
        name_field="title",
        id_parameter="message_id",
        fields={"status": "audit.fields.status"},
        transactional=False,
    ),
    "cancel_announcement": AuditActionDef(
        "notification.cancel",
        "audit.actions.notification.cancel",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=NotificationMessage,
        name_field="title",
        id_parameter="message_id",
        fields={"status": "audit.fields.status"},
        transactional=False,
    ),
    "recall_announcement": AuditActionDef(
        "notification.recall",
        "audit.actions.notification.recall",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=NotificationMessage,
        name_field="title",
        id_parameter="message_id",
        fields={"status": "audit.fields.status"},
        transactional=False,
    ),
    "retry_failed": AuditActionDef(
        "notification.retry-delivery",
        "audit.actions.notification.retry-delivery",
        "notification",
        "audit.resources.notification",
        risk_level=AuditRiskLevel.NORMAL,
        model=None,
        name_field="title",
        id_parameter="message_id",
        fields={},
        transactional=False,
    ),
    "preview_unsaved_audience": None,
    "preview_content": None,
    "preview_action": None,
    "check_banner": None,
    "mark_all_read": None,
    "mark_read": None,
    "archive_notification": None,
    "delete_notification": None,
    "update_preference": None,
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    return actions
