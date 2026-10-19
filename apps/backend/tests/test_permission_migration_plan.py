# apps/backend/tests/test_permission_migration_plan.py
"""迁移规划：旧三列 → 权限码，输出收窄 / 扩大 / 残留。"""

from plugins.permission.tests.catalog_fixtures import DEFAULT_BINDINGS, make_catalog
from src._permission_migration import (
    LegacyRole,
    ResidualInterface,
    find_residual_interfaces,
    format_report,
    plan_role,
)

EXEMPT = {"GET:/api/v1/auth/user/info"}


def _plan(role: LegacyRole):
    return plan_role(
        role,
        bindings=DEFAULT_BINDINGS,
        exempt=EXEMPT,
        catalog=make_catalog(),
        directory_routes={"manage"},
    )


def test_interfaces_buttons_and_menus_map_to_codes():
    plan = _plan(
        LegacyRole(
            code="editor",
            router_permissions=["manage", "manage_user"],
            button_permissions=["manage_user:delete"],
            interface_permissions=["GET:/api/v1/users", "GET:/api/v1/auth/user/info"],
        )
    )

    assert plan.codes == ["user:delete", "user:read"]
    assert plan.narrowed == []
    assert plan.unmapped_routes == []


def test_unmappable_entries_are_narrowed():
    plan = _plan(
        LegacyRole(
            code="editor",
            router_permissions=[],
            button_permissions=["custom:export"],
            interface_permissions=["GET:/custom/export"],
        )
    )

    assert plan.codes == []
    assert plan.narrowed == ["button custom:export", "interface GET:/custom/export"]


def test_mapping_to_undeclared_code_is_narrowed():
    plan = _plan(
        LegacyRole(
            code="editor", router_permissions=[], button_permissions=["manage_role:add"], interface_permissions=[]
        )
    )

    assert plan.codes == []
    assert plan.narrowed == ["button manage_role:add -> role:create (undeclared)"]


def test_widened_lists_routes_newly_reachable_through_codes_and_depends():
    plan = _plan(
        LegacyRole(
            code="editor",
            router_permissions=[],
            button_permissions=["manage_user:edit"],
            interface_permissions=["PUT:/api/v1/users/{user_id}"],
        )
    )

    assert plan.codes == ["user:update"]
    assert plan.widened == ["GET:/api/v1/departments/tree", "GET:/api/v1/users"]


def test_custom_menu_is_unmapped_route():
    plan = _plan(
        LegacyRole(code="editor", router_permissions=["custom_page"], button_permissions=[], interface_permissions=[])
    )

    assert plan.unmapped_routes == ["custom_page"]


def test_route_key_buttons_map_through_bindings():
    plan = _plan(
        LegacyRole(
            code="editor", router_permissions=[], button_permissions=["GET:/api/v1/roles/all"], interface_permissions=[]
        )
    )

    assert plan.codes == ["role:read"]


def test_residuals_are_menu_interfaces_without_declaration():
    residuals = find_residual_interfaces(
        [("manage_user", ["GET:/api/v1/users", "GET:/custom/export", "GET:/api/v1/auth/user/info"])],
        bindings=DEFAULT_BINDINGS,
        exempt=EXEMPT,
    )

    assert residuals == [ResidualInterface(menu="manage_user", route_key="GET:/custom/export")]


def test_report_mentions_every_section():
    plan = _plan(
        LegacyRole(
            code="editor",
            router_permissions=["custom_page"],
            button_permissions=["custom:export"],
            interface_permissions=["PUT:/api/v1/users/{user_id}"],
        )
    )
    report = format_report([plan], [ResidualInterface(menu="manage_user", route_key="GET:/custom/export")])

    assert "角色 editor" in report
    assert "收窄" in report and "button custom:export" in report
    assert "扩大" in report and "GET:/api/v1/users" in report
    assert "沿用旧路由权限" in report and "custom_page" in report
    assert "残留接口" in report and "manage_user  GET:/custom/export" in report
