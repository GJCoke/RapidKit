# apps/backend/tests/test_permission_migration_golden.py
"""
黄金测试：用迁移前的种子数据（菜单 buttons / interfaces 仍在）跑迁移规划，
确认 ADMIN、GUEST 无收窄，种子菜单无残留接口。
"""

from plugin_permission.catalog.loader import catalog_from_app, collect_exempt_route_keys
from rapidkit_common.enums import MenuType
from src import initdb
from src._permission_code_mapping import LEGACY_BUTTON_CODES, LEGACY_MENU_CODES
from src._permission_migration import LegacyRole, find_residual_interfaces, plan_role

from tests.legacy_menu_fixture import collect_seed_permissions, legacy_menus

RETIRED_MENUS = {"manage_data-policy", "manage_field-policy", "script"}
RETIRED_RESOURCES = {"data-policy", "field-policy", "script", "api-route"}

RETIRED_INTERFACES = {
    "GET:/api/v1/manage/menus/tree",
    "GET:/api/v1/router/backend",
    "GET:/api/v1/roles/mine",
    "POST:/api/v1/roles/{role_id}/apply-packages",
    "GET:/api/v1/workers",
    "GET:/api/v1/tasks/stats/timeline",
    "POST:/api/v1/schedules/crontab/preview",
    "GET:/api/v1/notifications/{notification_id}",
    "GET:/api/v1/admin/notification-templates/{template_id}",
    "POST:/api/v1/admin/notifications/{message_id}/audience-preview",
    "GET:/api/v1/system/health",
}


def _retired_interface(route_key):
    if route_key in RETIRED_INTERFACES:
        return True
    path = route_key.split(":", 1)[-1]
    return any(
        path == prefix or path.startswith(prefix + "/")
        for prefix in ("/api/v1/data-policies", "/api/v1/field-policies", "/api/v1/scripts")
    )


def _surviving_codes(values):
    return {code for code in values if code.split(":", 1)[0] not in RETIRED_RESOURCES}


def _context(app):
    catalog, bindings = catalog_from_app(app)
    menus = [menu for menu in legacy_menus() if menu.route_name not in RETIRED_MENUS]
    directories = {menu.route_name for menu in menus if menu.menu_type == MenuType.DIRECTORY or menu.constant}
    return catalog, bindings, collect_exempt_route_keys(app.routes), directories, menus


def test_admin_seed_migrates_without_narrowing(loaded_app):
    catalog, bindings, exempt, directories, _ = _context(loaded_app)
    legacy = collect_seed_permissions(
        [menu.route_name for menu in legacy_menus() if menu.route_name not in RETIRED_MENUS]
    )

    plan = plan_role(
        LegacyRole(
            code="ADMIN",
            router_permissions=[
                route
                for route in legacy["router_permissions"]
                if route != "manage_permission-extension"  # P5 新增页不属于迁移前的种子授权
            ],
            button_permissions=[key for key in legacy["button_permissions"] if not _retired_interface(key)],
            interface_permissions=[key for key in legacy["interface_permissions"] if not _retired_interface(key)],
        ),
        bindings=bindings,
        exempt=exempt,
        catalog=catalog,
        directory_routes=directories,
    )

    assert plan.narrowed == []
    assert plan.unmapped_routes == []
    assert _surviving_codes(LEGACY_BUTTON_CODES.values()) <= set(plan.codes)
    assert _surviving_codes(LEGACY_MENU_CODES.values()) <= set(plan.codes)


def test_guest_seed_migrates_to_menu_read_codes(loaded_app):
    catalog, bindings, exempt, directories, _ = _context(loaded_app)
    interfaces = [
        code
        for code in collect_seed_permissions(initdb.GUEST_ROUTER_PERMISSIONS)["interface_permissions"]
        if code.startswith("GET:") and not _retired_interface(code)
    ]

    plan = plan_role(
        LegacyRole(
            code="GUEST",
            router_permissions=initdb.GUEST_ROUTER_PERMISSIONS,
            button_permissions=[],
            interface_permissions=interfaces,
        ),
        bindings=bindings,
        exempt=exempt,
        catalog=catalog,
        directory_routes=directories,
    )

    assert plan.narrowed == []
    assert set(initdb.seed_role_codes(catalog)[1]) <= set(plan.codes)


def test_seed_menus_have_no_residual_interfaces(loaded_app):
    _, bindings, exempt, _, menus = _context(loaded_app)

    residuals = find_residual_interfaces(
        [(menu.route_name, [key for key in menu.interfaces if not _retired_interface(key)]) for menu in menus],
        bindings=bindings,
        exempt=exempt,
    )

    assert residuals == [], f"种子菜单引用了未声明的接口：{residuals}"


def test_retired_policy_permissions_are_reported_without_being_granted(loaded_app):
    catalog, bindings, exempt, directories, _ = _context(loaded_app)
    plan = plan_role(
        LegacyRole(
            code="OLD", router_permissions=["manage_data-policy"], button_permissions=[], interface_permissions=[]
        ),
        bindings=bindings,
        exempt=exempt,
        catalog=catalog,
        directory_routes=directories,
    )
    assert plan.codes == []
    assert plan.narrowed == ["menu manage_data-policy -> data-policy:read (undeclared)"]


def test_retired_script_permissions_are_not_migrated(loaded_app):
    catalog, bindings, exempt, directories, _ = _context(loaded_app)
    plan = plan_role(
        LegacyRole(
            code="OLD_SCRIPT",
            router_permissions=["script"],
            button_permissions=["script:execute"],
            interface_permissions=["GET:/api/v1/scripts"],
        ),
        bindings=bindings,
        exempt=exempt,
        catalog=catalog,
        directory_routes=directories,
    )
    assert plan.codes == []
    assert plan.narrowed == ["button script:execute", "interface GET:/api/v1/scripts"]
    assert plan.unmapped_routes == ["script"]
