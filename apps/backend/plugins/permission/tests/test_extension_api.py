"""扩展 API 声明测试。"""

from fastapi.routing import APIRoute
from rapidkit_common.access import inspect_route_access

from plugin_permission import register
from plugin_permission.extension.api import router


def test_every_extension_route_requires_manage_code():
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert {(tuple(sorted(r.methods)), r.path) for r in routes} == {
        (("GET",), "/permission-extensions"),
        (("POST",), "/permission-extensions"),
        (("PUT",), "/permission-extensions/{extension_id}"),
        (("DELETE",), "/permission-extensions/{extension_id}"),
        (("GET",), "/permission-extensions/export"),
        (("GET",), "/permission-extensions/denials"),
    }
    for route in routes:
        access = inspect_route_access(route)
        assert [(a.kind, a.code) for a in access] == [("require", "permission-extension:manage")], route.path


def test_manifest_declares_extension_resource_and_code():
    manifest = register()
    assert "permission-extension" in {r.key for r in manifest.resources}
    codes = {c.code: c for c in manifest.permission_codes}
    assert codes["permission-extension:manage"].abac_action == "write"
