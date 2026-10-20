"""菜单与路由接口访问声明。"""

from plugin_menu import register
from plugin_menu.api import router as menu_router
from plugin_menu.route_api import router as route_router
from tests.testing.access import declared_access


def test_menu_routes_declare_expected_access():
    assert declared_access(menu_router, route_router) == {
        "GET:/api/v1/manage/menus": "require:menu:read",
        "GET:/api/v1/manage/menus/active-menu-options": "require:menu:read",
        "GET:/api/v1/manage/pages": "require:menu:read",
        "POST:/api/v1/manage/menus": "require:menu:create",
        "PUT:/api/v1/manage/menus/{menu_id}": "require:menu:update",
        "DELETE:/api/v1/manage/menus/{menu_id}": "require:menu:delete",
        "DELETE:/api/v1/manage/menus": "require:menu:delete",
        "GET:/api/v1/route/constant": "public",
        "GET:/api/v1/route/user": "authenticated",
        "GET:/api/v1/route/exist": "public",
    }


def test_menu_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["menu"]
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "menu:read": (),
        "menu:create": ("menu:read",),
        "menu:update": ("menu:read",),
        "menu:delete": ("menu:read",),
    }
