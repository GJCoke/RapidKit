"""Business audit declarations owned by this plugin."""

from rapidkit_common.audit import bind_audit_routes
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

from plugin_department.models import Department

AUDIT_ROUTES = {
    "create_department": AuditActionDef(
        "department.create",
        "audit.actions.department.create",
        "department",
        "audit.resources.department",
        risk_level=AuditRiskLevel.NORMAL,
        model=Department,
        name_field="name",
        id_parameter=None,
        fields={
            "name": "audit.fields.name",
            "parent_id": "audit.fields.parent_id",
            "leader_id": "audit.fields.leader_id",
        },
        transactional=False,
    ),
    "update_department": AuditActionDef(
        "department.update",
        "audit.actions.department.update",
        "department",
        "audit.resources.department",
        risk_level=AuditRiskLevel.NORMAL,
        model=Department,
        name_field="name",
        id_parameter="dept_id",
        fields={
            "name": "audit.fields.name",
            "parent_id": "audit.fields.parent_id",
            "leader_id": "audit.fields.leader_id",
        },
        transactional=False,
    ),
    "delete_department": AuditActionDef(
        "department.delete",
        "audit.actions.department.delete",
        "department",
        "audit.resources.department",
        risk_level=AuditRiskLevel.NORMAL,
        model=Department,
        name_field="name",
        id_parameter="dept_id",
        fields={},
        transactional=False,
    ),
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    return actions
