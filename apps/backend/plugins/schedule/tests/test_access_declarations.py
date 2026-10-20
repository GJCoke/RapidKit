"""定时任务接口访问声明。"""

from plugin_schedule import register
from plugin_schedule.api import router
from tests.testing.access import declared_access


def test_schedule_routes_declare_expected_access():
    assert declared_access(router) == {
        "POST:/api/v1/schedules/preview": "require:schedule:read",
        "GET:/api/v1/schedules": "require:schedule:read",
        "GET:/api/v1/schedules/{schedule_id}": "require:schedule:read",
        "POST:/api/v1/schedules": "require:schedule:create",
        "PUT:/api/v1/schedules/{schedule_id}": "require:schedule:update",
        "PATCH:/api/v1/schedules/{schedule_id}/toggle": "require:schedule:update",
        "DELETE:/api/v1/schedules/{schedule_id}": "require:schedule:delete",
    }


def test_schedule_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["schedule"]
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "schedule:read": (),
        "schedule:create": ("schedule:read", "task:registered"),
        "schedule:update": ("schedule:read", "task:registered"),
        "schedule:delete": ("schedule:read",),
    }
