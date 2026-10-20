"""代码声明是权限及功能包的唯一来源。"""

import inspect
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from plugin_permission import register
from plugin_permission.catalog.registry import CatalogError, build_catalog, get_catalog, set_catalog
from plugin_permission.catalog.startup import build_catalog_on_startup
from plugin_permission.models import InterfaceRouter, Role
from plugin_permission.package.services import apply_packages_to_role
from plugin_permission.status_codes import RbacStatusCode
from rapidkit_common.access import Require, inspect_route_access
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, PluginManifest, ResourceDef
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession


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
    assert set(plugin.models) == {Role, InterfaceRouter}
    for route in plugin.router.routes:
        if isinstance(route, APIRoute) and (
            route.path == "/permission-packages/all" or route.path.endswith("/apply-packages")
        ):
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


async def test_code_packages_apply_without_package_table_and_reject_unknown_keys():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(lambda sync: Role.__table__.create(sync))
        async with AsyncSession(engine, expire_on_commit=False) as session:
            role = Role(name="Static packages", code="STATIC_ROLE", permission_codes=["demo:read"])
            session.add(role)
            await session.flush()
            full = PermissionPackageDef(key="demo.full", label="Full", codes=("demo:update",))
            readonly = PermissionPackageDef(key="demo.readonly", label="Read", codes=("demo:read",))
            set_catalog(build_catalog([manifest(full, readonly)], {}))
            merged = await apply_packages_to_role(session, role.id, ["demo.full", "demo.full"], "merge")
            assert merged.role.permission_codes == ["demo:read", "demo:update"]
            assert merged.diff.added_codes == ["demo:update"]
            with pytest.raises(AppException) as error:
                await apply_packages_to_role(session, role.id, ["custom.old"], "replace")
            assert error.value.code == RbacStatusCode.PACKAGE_NOT_FOUND.code
            assert role.permission_codes == ["demo:read", "demo:update"]
            replaced = await apply_packages_to_role(session, role.id, ["demo.readonly"], "replace")
            assert replaced.role.permission_codes == ["demo:read"]
            assert replaced.diff.removed_codes == ["demo:update"]
    finally:
        await engine.dispose()
