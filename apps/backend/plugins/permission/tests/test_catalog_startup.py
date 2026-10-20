"""启动时构建权限码目录。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from plugin_permission import register
from plugin_permission.catalog import startup
from plugin_permission.catalog.registry import CatalogError, get_catalog, set_catalog
from plugin_permission.catalog.startup import build_catalog_on_startup
from plugin_permission.dashboard.services import find_unknown_dashboard_codes
from plugins.permission.tests.catalog_fixtures import install_catalog
from rapidkit_common.access import Require
from rapidkit_framework.plugin import DashboardModuleDef, PermissionCodeDef, PluginManifest, ResourceDef


def _app(*, naked: bool = False) -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/items", dependencies=[Require("item:read")])
    async def items() -> None:
        return None

    if naked:

        @app.get("/api/v1/naked")
        async def naked_route() -> None:
            return None

    app.state.plugins = [
        PluginManifest(
            name="items",
            version="0.1.0",
            resources=[ResourceDef(key="item", label="条目")],
            permission_codes=[PermissionCodeDef(code="item:read", label="查看", abac_action="read")],
        )
    ]
    return app


async def test_startup_builds_and_publishes_catalog(monkeypatch):
    set_catalog(None)
    try:
        await build_catalog_on_startup(_app())
        assert get_catalog().codes_for_route("GET:/api/v1/items") == {"item:read"}
    finally:
        set_catalog(None)


async def test_startup_fails_on_route_errors():
    set_catalog(None)
    with pytest.raises(CatalogError, match="GET:/api/v1/naked: Route has no access declaration"):
        await build_catalog_on_startup(_app(naked=True))
    with pytest.raises(RuntimeError):
        get_catalog()


def test_register_runs_catalog_build_first():
    manifest = register()
    assert manifest.on_startup[0] is build_catalog_on_startup
    assert manifest.on_startup[1].__name__ == "sync_catalog_version_on_startup"
    assert manifest.on_startup[2].__name__ == "sync_routes_on_startup"


def _manifest(*codes: str) -> PluginManifest:
    return PluginManifest(
        name="dash",
        version="0.0.0",
        dashboard_modules=[DashboardModuleDef(key="dashboard.x", required_permissions=codes)],
    )


def test_unknown_dashboard_codes_are_reported():
    catalog = install_catalog()

    assert find_unknown_dashboard_codes([_manifest("user:read", "ghost:read")], catalog) == ["ghost:read"]


async def test_startup_syncs_catalog_version(monkeypatch):
    catalog = install_catalog()
    sync = AsyncMock(return_value=5)
    monkeypatch.setattr(startup, "sync_catalog_version", sync)
    monkeypatch.setattr(startup.RedisManager, "client", lambda: object())
    app = SimpleNamespace(state=SimpleNamespace(plugins=[_manifest("user:read")]), routes=[])
    monkeypatch.setattr(startup, "collect_route_bindings", lambda routes: {"GET:/api/v1/users": "user:read"})

    await startup.sync_catalog_version_on_startup(app)

    sync.assert_awaited_once()
    assert sync.await_args.args[1] == catalog.digest()


async def test_startup_rejects_unknown_dashboard_codes(monkeypatch):
    install_catalog()
    monkeypatch.setattr(startup, "sync_catalog_version", AsyncMock(return_value=1))
    monkeypatch.setattr(startup.RedisManager, "client", lambda: object())
    app = SimpleNamespace(state=SimpleNamespace(plugins=[_manifest("ghost:read")]), routes=[])

    with pytest.raises(CatalogError, match="ghost:read"):
        await startup.sync_catalog_version_on_startup(app)
