"""Business audit declarations owned by this plugin."""

from rapidkit_common.audit import bind_audit_routes
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

from plugin_user.models import User

AUDIT_ROUTES = {
    "validate_username_pinyin": None,
    "create_user": AuditActionDef(
        "user.create",
        "audit.actions.user.create",
        "user",
        "audit.resources.user",
        risk_level=AuditRiskLevel.NORMAL,
        model=User,
        name_field="name",
        id_parameter=None,
        fields={
            "name": "audit.fields.name",
            "username": "audit.fields.username",
            "status": "audit.fields.status",
            "is_admin": "audit.fields.is_admin",
        },
        transactional=False,
    ),
    "update_user": AuditActionDef(
        "user.update",
        "audit.actions.user.update",
        "user",
        "audit.resources.user",
        risk_level=AuditRiskLevel.NORMAL,
        model=User,
        name_field="name",
        id_parameter="user_id",
        fields={
            "name": "audit.fields.name",
            "username": "audit.fields.username",
            "status": "audit.fields.status",
            "is_admin": "audit.fields.is_admin",
            "roles": "audit.fields.roles",
        },
        transactional=False,
    ),
    "delete_user": AuditActionDef(
        "user.delete",
        "audit.actions.user.delete",
        "user",
        "audit.resources.user",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=User,
        name_field="name",
        id_parameter="user_id",
        fields={"name": "audit.fields.name", "username": "audit.fields.username"},
        transactional=False,
    ),
    "batch_delete_users": AuditActionDef(
        "user.batch-delete",
        "audit.actions.user.batch-delete",
        "user",
        "audit.resources.user",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=User,
        name_field="name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
    "change_password": AuditActionDef(
        "user.change-password",
        "audit.actions.user.change-password",
        "user",
        "audit.resources.user",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=User,
        name_field="name",
        id_parameter="user_id",
        fields={"password": "audit.fields.password"},
        transactional=True,
    ),
    "resend_invite": AuditActionDef(
        "user.resend-invite",
        "audit.actions.user.resend-invite",
        "user",
        "audit.resources.user",
        risk_level=AuditRiskLevel.SENSITIVE,
        model=User,
        name_field="name",
        id_parameter="user_id",
        fields={},
        transactional=False,
    ),
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    return actions
