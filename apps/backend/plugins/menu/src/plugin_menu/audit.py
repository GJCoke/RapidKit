"""Business audit declarations owned by this plugin."""

from rapidkit_common.audit import bind_audit_routes
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel

from plugin_menu.models import Menu

AUDIT_ROUTES = {
    "add_menu": AuditActionDef(
        "menu.create",
        "audit.actions.menu.create",
        "menu",
        "audit.resources.menu",
        risk_level=AuditRiskLevel.NORMAL,
        model=Menu,
        name_field="menu_name",
        id_parameter=None,
        fields={
            "menu_name": "audit.fields.menu_name",
            "status": "audit.fields.status",
            "parent_id": "audit.fields.parent_id",
        },
        transactional=False,
    ),
    "update_menu": AuditActionDef(
        "menu.update",
        "audit.actions.menu.update",
        "menu",
        "audit.resources.menu",
        risk_level=AuditRiskLevel.NORMAL,
        model=Menu,
        name_field="menu_name",
        id_parameter="menu_id",
        fields={
            "menu_name": "audit.fields.menu_name",
            "status": "audit.fields.status",
            "parent_id": "audit.fields.parent_id",
            "permission": "audit.fields.permission",
        },
        transactional=False,
    ),
    "delete_menu": AuditActionDef(
        "menu.delete",
        "audit.actions.menu.delete",
        "menu",
        "audit.resources.menu",
        risk_level=AuditRiskLevel.NORMAL,
        model=Menu,
        name_field="menu_name",
        id_parameter="menu_id",
        fields={},
        transactional=False,
    ),
    "batch_delete_menus": AuditActionDef(
        "menu.batch-delete",
        "audit.actions.menu.batch-delete",
        "menu",
        "audit.resources.menu",
        risk_level=AuditRiskLevel.NORMAL,
        model=Menu,
        name_field="menu_name",
        id_parameter=None,
        fields={},
        transactional=False,
    ),
}


def configure_audit(router):
    actions = bind_audit_routes(router, AUDIT_ROUTES)
    return actions
