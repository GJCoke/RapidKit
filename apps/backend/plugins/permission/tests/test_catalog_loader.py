# apps/backend/plugins/permission/tests/test_catalog_loader.py
"""catalog_from_app 与免检路由收集测试。"""

from typing import Annotated

from fastapi import APIRouter, FastAPI
from rapidkit_common.access import Authenticated, Public, Require, Scope
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef

from plugin_permission.catalog.loader import catalog_from_app, collect_exempt_route_keys


def _app() -> FastAPI:
    router = APIRouter(prefix="/api/v1")

    @router.get("/items")
    async def list_items(scope: Annotated[Scope, Require("item:read")]) -> None: ...

    @router.get("/me", dependencies=[Authenticated])
    async def me() -> None: ...

    @router.post("/login", dependencies=[Public])
    async def login() -> None: ...

    app = FastAPI()
    app.include_router(router)
    app.state.plugins = [
        PluginManifest(
            name="items",
            version="0.0.0",
            resources=[ResourceDef(key="item", label="条目")],
            permission_codes=[PermissionCodeDef(code="item:read", label="查看条目", abac_action="read")],
        )
    ]
    return app


def test_catalog_from_app_returns_catalog_and_bindings():
    catalog, bindings = catalog_from_app(_app())

    assert bindings == {"GET:/api/v1/items": "item:read"}
    assert catalog.codes_for_route("GET:/api/v1/items") == {"item:read"}


def test_exempt_route_keys_cover_authenticated_and_public():
    assert collect_exempt_route_keys(_app().routes) == {"GET:/api/v1/me", "POST:/api/v1/login"}
