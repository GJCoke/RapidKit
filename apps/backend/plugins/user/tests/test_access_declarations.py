"""用户接口访问声明。"""

from plugin_user import register
from plugin_user.api import contact_router, router
from tests.testing.access import declared_access


def test_user_routes_declare_expected_access():
    assert declared_access(contact_router, router) == {
        "GET:/api/v1/users/admin-contacts": "authenticated",
        "PUT:/api/v1/users/{user_id}/password": "require:user:reset-password+deny-impersonation",
        "GET:/api/v1/users/stats/summary": "require:user:stats",
        "GET:/api/v1/users/stats/trend": "require:user:stats",
        "GET:/api/v1/users/all": "require:user:options",
        "POST:/api/v1/users/validate-username-pinyin": "require:user:validate-name",
        "GET:/api/v1/users": "require:user:read",
        "GET:/api/v1/users/{user_id}": "require:user:read",
        "POST:/api/v1/users": "require:user:create",
        "POST:/api/v1/users/{user_id}/resend-invite": "require:user:create",
        "PUT:/api/v1/users/{user_id}": "require:user:update",
        "DELETE:/api/v1/users/{user_id}": "require:user:delete",
        "DELETE:/api/v1/users": "require:user:delete",
    }


def test_user_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["user"]
    codes = {c.code: c.depends for c in manifest.permission_codes}
    assert codes == {
        "user:options": (),
        "user:read": ("user:options", "role:options", "department:read"),
        "user:validate-name": (),
        "user:create": ("user:read", "user:validate-name"),
        "user:update": ("user:read", "user:validate-name"),
        "user:delete": ("user:read",),
        "user:reset-password": ("user:read",),
        "user:stats": (),
    }
