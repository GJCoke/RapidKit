"""system 插件接口访问声明。"""

from plugin_system import register
from tests.testing.access import declared_access


def test_system_routes_declare_expected_access():
    assert declared_access(register().router) == {
        "GET:/api/v1/system/stats/operations-overview": "require:dashboard:read",
        "GET:/api/v1/system/stats/resources": "require:dashboard:infrastructure",
        "GET:/api/v1/system/stats/errors": "require:dashboard:errors",
        "GET:/api/v1/system/stats/health": "require:dashboard:health",
        "GET:/api/v1/system/stats/infrastructure": "require:dashboard:infrastructure",
        "GET:/api/v1/system/stats/business": "require:dashboard:business",
        "GET:/api/v1/system/activities": "require:dashboard:activity",
        "GET:/api/v1/system/audit-logs/paginate": "require:audit-log:read",
        "GET:/api/v1/system/audit-logs/catalog": "require:audit-log:read",
        "GET:/api/v1/system/audit-logs/actors": "require:audit-log:read",
        "GET:/api/v1/system/audit-logs/{item_id}/targets": "require:audit-log:read",
        "GET:/api/v1/system/audit-logs/{item_id}": "require:audit-log:read",
        "GET:/api/v1/system/plugins": "require:plugin:read",
        "GET:/api/v1/system/plugins/dependencies": "require:plugin:read",
        "GET:/api/v1/system/events": "require:plugin:read",
    }


def test_system_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["dashboard", "audit-log", "plugin", "socketio"]
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "dashboard:read": (),
        "dashboard:health": (),
        "dashboard:infrastructure": (),
        "dashboard:business": (),
        "dashboard:activity": (),
        "dashboard:errors": (),
        "audit-log:read": ("user:options",),
        "plugin:read": (),
        "socketio:read": (),
    }
