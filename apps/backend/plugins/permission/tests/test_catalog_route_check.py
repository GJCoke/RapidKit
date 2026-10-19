"""路由访问声明自检测试。"""

from typing import Annotated

from fastapi import FastAPI
from plugin_permission.catalog.registry import build_catalog
from plugin_permission.catalog.route_check import check_routes, collect_route_bindings
from rapidkit_common.access import Authenticated, Public, Require, Scope
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef


def _manifests() -> list[PluginManifest]:
    return [
        PluginManifest(
            name="items",
            version="0.1.0",
            resources=[ResourceDef(key="item", label="条目")],
            permission_codes=[
                PermissionCodeDef(code="item:read", label="查看", abac_action="read"),
                PermissionCodeDef(code="item:export", label="导出", abac_action="read"),
            ],
        )
    ]

def _app() -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/items", dependencies=[Require("item:read")])
    async def listed() -> None:
        return None

    @app.get("/api/v1/items/{item_id}")
    async def detail(item_id: int, scope: Annotated[Scope, Require("item:read")]) -> None:
        return None

    @app.get("/api/v1/me", dependencies=[Authenticated])
    async def me() -> None:
        return None

    @app.post("/api/v1/login", dependencies=[Public])
    async def login() -> None:
        return None

    return app


def test_collect_route_bindings_only_includes_single_require_routes():
    assert collect_route_bindings(_app().routes) == {
        "GET:/api/v1/items": "item:read",
        "GET:/api/v1/items/{item_id}": "item:read",
    }


def test_clean_routes_only_warn_about_unbound_codes():
    app = _app()
    catalog = build_catalog(_manifests(), collect_route_bindings(app.routes))
    issues = check_routes(app.routes, catalog)
    assert [(i.level, i.route_key) for i in issues] == [("warning", "code:item:export")]


def test_missing_declaration_is_error():
    app = _app()

    @app.get("/api/v1/naked")
    async def naked() -> None:
        return None

    catalog = build_catalog(_manifests(), collect_route_bindings(app.routes))
    errors = [i for i in check_routes(app.routes, catalog) if i.level == "error"]
    assert [(i.route_key, i.message) for i in errors] == [
        ("GET:/api/v1/naked", "Route has no access declaration; use Require, Authenticated or Public")
    ]


def test_multiple_declarations_is_error():
    app = _app()

    @app.get("/api/v1/double", dependencies=[Require("item:read"), Public])
    async def double() -> None:
        return None

    catalog = build_catalog(_manifests(), collect_route_bindings(app.routes))
    errors = [i for i in check_routes(app.routes, catalog) if i.level == "error"]
    assert [(i.route_key, i.message) for i in errors] == [
        ("GET:/api/v1/double", "Route has multiple access declarations: require:item:read, public")
    ]


def test_unknown_code_is_error():
    app = _app()

    @app.get("/api/v1/ghost", dependencies=[Require("item:ghost")])
    async def ghost() -> None:
        return None

    catalog = build_catalog(_manifests(), {"GET:/api/v1/items": "item:read"})
    errors = [i for i in check_routes(app.routes, catalog) if i.level == "error"]
    assert [(i.route_key, i.message) for i in errors] == [("GET:/api/v1/ghost", "Unknown permission code 'item:ghost'")]
