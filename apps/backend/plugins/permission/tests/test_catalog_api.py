# apps/backend/plugins/permission/tests/test_catalog_api.py
"""权限码目录响应测试。"""

from fastapi.routing import APIRoute
from rapidkit_common.access import inspect_route_access

from plugin_permission.catalog.api import router
from plugin_permission.catalog.services import build_catalog_response
from plugins.permission.tests.catalog_fixtures import make_catalog


def test_response_lists_resources_and_codes_sorted():
    response = build_catalog_response(make_catalog())
    data = response.model_dump(by_alias=True)

    assert [item["key"] for item in data["resources"]] == ["department", "role", "user"]
    assert data["resources"][0] == {"key": "department", "label": "部门", "dataScopes": [], "fieldGroups": []}
    update = next(item for item in data["codes"] if item["code"] == "user:update")
    assert update == {
        "code": "user:update",
        "resource": "user",
        "label": "编辑用户",
        "abacAction": "write",
        "depends": ["user:read", "department:read"],
        "source": "code",
    }
    assert [item["code"] for item in data["codes"]] == sorted(item["code"] for item in data["codes"])


def test_endpoint_requires_role_read():
    [route] = [route for route in router.routes if isinstance(route, APIRoute)]

    assert [(access.kind, access.code) for access in inspect_route_access(route)] == [("require", "role:read")]
