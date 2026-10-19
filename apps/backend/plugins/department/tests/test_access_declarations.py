"""部门接口访问声明。"""

from plugin_department import register
from plugin_department.api import router

from tests.testing.access import declared_access


def test_department_routes_declare_expected_access():
    assert declared_access(router) == {
        "GET:/api/v1/departments/tree": "require:department:read",
        "POST:/api/v1/departments": "require:department:create",
        "PUT:/api/v1/departments/{dept_id}": "require:department:update",
        "DELETE:/api/v1/departments/{dept_id}": "require:department:delete",
    }


def test_department_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["department"]
    assert {c.code for c in manifest.permission_codes} == {
        "department:read",
        "department:create",
        "department:update",
        "department:delete",
    }
