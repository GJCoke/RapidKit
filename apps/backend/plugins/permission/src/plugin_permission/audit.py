"""
Structured audit logging for RBAC/ABAC decisions.

Uses the project's Loguru-based logger with a dedicated name
for filtering and routing audit events.

Author : Coke
Date   : 2026-05-08
"""

from uuid import UUID

from rapidkit_common.audit import bind_audit_routes
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

from plugin_permission.models import Role

audit_logger = get_plugin_logger("RBACaudit")


def log_data_scope_result(
    *,
    user_id: UUID,
    resource: str,
    method: str,
    scope_keys: list[str],
    result: str,
) -> None:
    """Log the data scope bound to a request."""
    audit_logger.bind(
        event="permission.scope.unrestricted" if result == "unrestricted" else "permission.scope.filtered",
        outcome=None if result == "unrestricted" else "filtered",
        reason_code="scope_unrestricted" if result == "unrestricted" else "scope_restricted",
        user_id=user_id,
        method=method,
    ).debug("Data scope {}: resource={} scopes={}", result, resource, scope_keys)


def log_permission_denied(
    *,
    user_id: UUID,
    code: str,
    route_key: str,
) -> None:
    """Log a structured RBAC denial (missing permission code)."""
    audit_logger.bind(
        event="permission.access.rejected", outcome="rejected", reason_code="permission_denied", user_id=user_id
    ).warning("RBAC denied: code={} route={}", code, route_key)


AUDIT_ROUTES = {
    "create_role": AuditActionDef(
        "role.create",
        "audit.actions.role.create",
        "role",
        "audit.resources.role",
        risk_level=AuditRiskLevel.NORMAL,
        model=Role,
        name_field="name",
        id_parameter=None,
        fields={"name": "audit.fields.name", "code": "audit.fields.code", "status": "audit.fields.status"},
        transactional=False,
    ),
    "update_role": AuditActionDef(
        "role.update",
        "audit.actions.role.update",
        "role",
        "audit.resources.role",
        risk_level=AuditRiskLevel.NORMAL,
        model=Role,
        name_field="name",
        id_parameter="role_id",
        fields={"name": "audit.fields.name", "code": "audit.fields.code", "status": "audit.fields.status"},
        transactional=False,
    ),
    "delete_role": AuditActionDef(
        "role.delete",
        "audit.actions.role.delete",
        "role",
        "audit.resources.role",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=Role,
        name_field="name",
        id_parameter="role_id",
        fields={},
        transactional=False,
    ),
    "batch_delete_role": AuditActionDef(
        "role.batch-delete",
        "audit.actions.role.batch-delete",
        "role",
        "audit.resources.role",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=Role,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "update_role_permissions": AuditActionDef(
        "role.grant-permissions",
        "audit.actions.role.grant-permissions",
        "role",
        "audit.resources.role",
        risk_level=AuditRiskLevel.CRITICAL,
        model=Role,
        name_field="name",
        id_parameter="role_id",
        fields={
            "permission_codes": "audit.fields.permission_codes",
            "data_scopes": "audit.fields.data_scopes",
            "field_modes": "audit.fields.field_modes",
        },
        transactional=True,
    ),
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    return actions
