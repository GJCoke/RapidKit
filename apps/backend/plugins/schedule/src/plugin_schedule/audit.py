"""Business audit declarations owned by this plugin."""

from rapidkit_common.audit import bind_audit_routes
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

from plugin_schedule.models import PeriodicTask

AUDIT_ROUTES = {
    "get_schedule_preview": None,
    "create_schedule": AuditActionDef(
        "schedule.create",
        "audit.actions.schedule.create",
        "schedule",
        "audit.resources.schedule",
        risk_level=AuditRiskLevel.NORMAL,
        model=PeriodicTask,
        name_field="name",
        id_parameter=None,
        fields={
            "name": "audit.fields.name",
            "task": "audit.fields.task",
            "enabled": "audit.fields.enabled",
            "description": "audit.fields.description",
        },
        transactional=False,
    ),
    "update_schedule": AuditActionDef(
        "schedule.update",
        "audit.actions.schedule.update",
        "schedule",
        "audit.resources.schedule",
        risk_level=AuditRiskLevel.NORMAL,
        model=PeriodicTask,
        name_field="name",
        id_parameter="schedule_id",
        fields={
            "name": "audit.fields.name",
            "task": "audit.fields.task",
            "enabled": "audit.fields.enabled",
            "description": "audit.fields.description",
        },
        transactional=False,
    ),
    "delete_schedule": AuditActionDef(
        "schedule.delete",
        "audit.actions.schedule.delete",
        "schedule",
        "audit.resources.schedule",
        risk_level=AuditRiskLevel.NORMAL,
        model=PeriodicTask,
        name_field="name",
        id_parameter="schedule_id",
        fields={},
        transactional=False,
    ),
    "toggle_schedule": AuditActionDef(
        "schedule.toggle",
        "audit.actions.schedule.toggle",
        "schedule",
        "audit.resources.schedule",
        risk_level=AuditRiskLevel.NORMAL,
        model=PeriodicTask,
        name_field="name",
        id_parameter="schedule_id",
        fields={"enabled": "audit.fields.enabled"},
        transactional=False,
    ),
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    actions.extend(
        [
            AuditActionDef(
                "schedule.enable",
                "audit.actions.schedule.enable",
                "schedule",
                "audit.resources.schedule",
                fields={"enabled": "audit.fields.enabled"},
            ),
            AuditActionDef(
                "schedule.disable",
                "audit.actions.schedule.disable",
                "schedule",
                "audit.resources.schedule",
                fields={"enabled": "audit.fields.enabled"},
            ),
        ]
    )
    return actions
