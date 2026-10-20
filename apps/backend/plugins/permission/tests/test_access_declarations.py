"""permission 插件接口访问声明。"""

from plugin_permission import register
from plugin_permission.dashboard.api import router as dashboard_router
from plugin_permission.role.api import router as role_router

from tests.testing.access import declared_access


def test_permission_routes_declare_expected_access():
    assert declared_access(role_router, dashboard_router) == {
        "GET:/api/v1/roles": "require:role:read",
        "GET:/api/v1/roles/all": "require:role:options",
        "GET:/api/v1/roles/{role_id}/permissions": "require:role:read",
        "PUT:/api/v1/roles/{role_id}/permissions": "require:role:grant",
        "POST:/api/v1/roles": "require:role:create",
        "PUT:/api/v1/roles/{role_id}": "require:role:update",
        "DELETE:/api/v1/roles": "require:role:delete",
        "DELETE:/api/v1/roles/{role_id}": "require:role:delete",
        "GET:/api/v1/dashboard/capabilities": "authenticated",
    }


def test_permission_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["role"]
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "role:options": (),
        "role:read": ("role:options",),
        "role:create": ("role:read",),
        "role:update": ("role:read",),
        "role:delete": ("role:read",),
        "role:grant": ("role:read", "menu:read"),
    }
