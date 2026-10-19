"""菜单残留接口转换测试。"""

from types import SimpleNamespace

from plugin_permission.catalog.extensions import CatalogExtension
from plugin_permission.catalog.registry import build_catalog
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef
from src._menu_residuals import plan_menu_residuals

MANIFESTS = [
    PluginManifest(
        name="demo",
        version="0.1.0",
        resources=[ResourceDef(key="user", label="用户"), ResourceDef(key="department", label="部门")],
        permission_codes=[
            PermissionCodeDef(code="user:read", label="查看用户", abac_action="read"),
            PermissionCodeDef(code="user:update", label="编辑用户", abac_action="write", depends=("department:read",)),
            PermissionCodeDef(code="department:read", label="查看部门", abac_action="read"),
        ],
    )
]
BINDINGS = {
    "GET:/api/v1/users": "user:read",
    "GET:/api/v1/departments/tree": "department:read",
    "GET:/api/v1/departments/export": "department:read",
}
ALL_ROUTES = set(BINDINGS) | {"GET:/api/v1/auth/me"}


def _menu(route_name: str, interfaces: list[str]):
    return SimpleNamespace(route_name=route_name, interfaces=interfaces, constant=False)


def _plan(menus, seeds, existing=()):
    catalog = build_catalog(MANIFESTS, BINDINGS)
    return plan_menu_residuals(
        menus=menus,
        seed_interfaces=seeds,
        menu_codes={"manage_user": "user:read"},
        catalog=catalog,
        route_bindings=BINDINGS,
        all_route_keys=ALL_ROUTES,
        existing=list(existing),
    )


def test_manual_interface_becomes_route_binding():
    report = _plan(
        [_menu("manage_user", ["GET:/api/v1/users", "GET:/api/v1/departments/export"])],
        {"manage_user": {"GET:/api/v1/users"}},
    )
    assert report.to_create == [
        CatalogExtension(kind="route_binding", code="user:read", route_key="GET:/api/v1/departments/export")
    ]
    assert report.notes == {"GET:/api/v1/departments/export": "迁移自菜单 manage_user"}


def test_skips_seed_covered_unprotected_missing_unmapped_and_existing():
    report = _plan(
        [
            _menu(
                "manage_user",
                [
                    "GET:/api/v1/departments/tree",  # 种子中已有
                    "GET:/api/v1/auth/me",  # Authenticated / Public
                    "GET:/api/v1/gone",  # 接口已不存在
                    "GET:/api/v1/departments/export",  # 已有等价扩展
                ],
            ),
            _menu("custom_page", ["GET:/api/v1/departments/export"]),  # 菜单无对应码
        ],
        {"manage_user": {"GET:/api/v1/departments/tree"}},
        existing=[CatalogExtension(kind="route_binding", code="user:read", route_key="GET:/api/v1/departments/export")],
    )
    assert report.to_create == []
    reasons = sorted((s.route_name, s.route_key, s.reason) for s in report.skipped)
    assert reasons == [
        ("custom_page", "*", "unmapped_menu"),
        ("manage_user", "GET:/api/v1/auth/me", "not_protected"),
        ("manage_user", "GET:/api/v1/departments/export", "existing_extension"),
        ("manage_user", "GET:/api/v1/departments/tree", "seed"),
        ("manage_user", "GET:/api/v1/gone", "route_missing"),
    ]


def test_interface_covered_by_code_expansion_is_skipped():
    catalog = build_catalog(MANIFESTS, BINDINGS)
    report = plan_menu_residuals(
        menus=[_menu("manage_user", ["GET:/api/v1/departments/export"])],
        seed_interfaces={"manage_user": set()},
        menu_codes={"manage_user": "user:update"},
        catalog=catalog,
        route_bindings=BINDINGS,
        all_route_keys=ALL_ROUTES,
        existing=[],
    )
    assert report.to_create == []
    assert [s.reason for s in report.skipped] == ["covered"]
