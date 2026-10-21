"""Business audit declarations owned by this plugin."""

from rapidkit_common.audit import bind_audit_routes
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

AUDIT_ROUTES = {
    "login": AuditActionDef(
        "auth.login",
        "audit.actions.auth.login",
        "auth-session",
        "audit.resources.auth-session",
        risk_level=AuditRiskLevel.NORMAL,
        model=None,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "login_swagger": AuditActionDef(
        "auth.login",
        "audit.actions.auth.login",
        "auth-session",
        "audit.resources.auth-session",
        risk_level=AuditRiskLevel.NORMAL,
        model=None,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "logout": AuditActionDef(
        "auth.logout",
        "audit.actions.auth.logout",
        "auth-session",
        "audit.resources.auth-session",
        risk_level=AuditRiskLevel.NORMAL,
        model=None,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "refresh_token": None,
    "create_impersonation": None,
    "stop_impersonation": None,
    "request_reset": AuditActionDef(
        "auth.request-password-reset",
        "audit.actions.auth.request-password-reset",
        "auth-session",
        "audit.resources.auth-session",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=None,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "confirm_reset": AuditActionDef(
        "auth.confirm-password-reset",
        "audit.actions.auth.confirm-password-reset",
        "auth-session",
        "audit.resources.auth-session",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=None,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "set_password": AuditActionDef(
        "auth.accept-invite",
        "audit.actions.auth.accept-invite",
        "auth-session",
        "audit.resources.auth-session",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=None,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    for suffix in ("start", "stop", "expire", "revoke"):
        actions.append(
            AuditActionDef(
                f"impersonation.{suffix}",
                f"audit.actions.impersonation.{suffix}",
                "impersonation",
                "audit.resources.impersonation",
                risk_level=AuditRiskLevel.SENSITIVE,
                transactional=True,
            )
        )
    return actions
