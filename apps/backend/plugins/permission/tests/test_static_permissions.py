"""代码声明是权限及功能包的唯一来源。"""

import inspect
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from plugin_permission import register
from plugin_permission.catalog.registry import CatalogError, build_catalog, get_catalog
from plugin_permission.catalog.startup import build_catalog_on_startup
from plugin_permission.models import Role
from rapidkit_common.access import Require, inspect_route_access
from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, PluginManifest, ResourceDef


def manifest(*packages):
    return PluginManifest(
        name="demo",
        version="0",
        resources=[ResourceDef(key="demo", label="Demo")],
        permission_codes=[
            PermissionCodeDef(code="demo:read", label="Read", abac_action="read"),
            PermissionCodeDef(code="demo:update", label="Update", abac_action="write", depends=("demo:read",)),
        ],
        permission_packages=list(packages),
    )


def test_no_runtime_permission_management_endpoints_or_models():
    plugin = register()
    routes = [
        (method, route.path)
        for route in plugin.router.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    ]
    assert not any("permission-extensions" in path for _, path in routes)
    assert [(method, path) for method, path in routes if "permission-packages" in path] == [
        ("GET", "/permission-packages/all")
    ]
    assert set(plugin.models) == {Role}
    for route in plugin.router.routes:
        if isinstance(route, APIRoute) and (route.path == "/permission-packages/all"):
            assert [(access.kind, access.code) for access in inspect_route_access(route)] == [("require", "role:grant")]
    assert not any(
        code.code.startswith(("permission-extension:", "permission-package:")) for code in plugin.permission_codes
    )
    assert "extensions" not in inspect.signature(build_catalog).parameters


def test_catalog_validates_code_packages_and_dependencies():
    package = PermissionPackageDef(key="demo.full", label="Full", codes=("demo:update",))
    catalog = build_catalog([manifest(package)], {"GET:/demo": "demo:read"})
    assert catalog.packages == {package.key: package}
    assert catalog.expand(package.codes) == {"demo:update", "demo:read"}
    assert not catalog.allows("demo:read", "GET:/demo", ["demo:custom"])
    with pytest.raises(CatalogError, match="unknown codes"):
        build_catalog([manifest(PermissionPackageDef(key="demo.bad", label="Bad", codes=("demo:missing",)))], {})
    with pytest.raises(CatalogError, match="Duplicate permission package"):
        build_catalog([manifest(package), PluginManifest(name="other", version="0", permission_packages=[package])], {})


async def test_startup_needs_no_extension_database(monkeypatch):
    from plugin_permission.catalog import startup

    app = FastAPI()
    app.state.plugins = [manifest()]
    app.add_api_route("/demo", lambda: None, dependencies=[Require("demo:read")])
    forbidden = AsyncMock(side_effect=AssertionError("Static catalog must not open a DB session"))
    monkeypatch.setattr(startup, "AsyncSessionLocal", forbidden, raising=False)
    await build_catalog_on_startup(app)
    assert get_catalog().codes_for_route("GET:/demo") == {"demo:read"}
    forbidden.assert_not_called()
