"""
CI 契约：应用的每个路由恰有一种访问声明，目录合法，Public 接口经过评审。

应用在测试函数内导入：``src.main`` 导入时需要运行中的事件循环。
"""

from importlib import import_module
from pathlib import Path

from fastapi import FastAPI
from fastapi.routing import APIRoute
from plugin_permission.catalog.registry import build_catalog
from plugin_permission.catalog.route_check import check_routes, collect_route_bindings
from plugin_permission.utils import build_route_key
from rapidkit_common.access import inspect_route_access

PUBLIC_SNAPSHOT = Path(__file__).with_name("route_access_public.txt")


def _app() -> FastAPI:
    return import_module("src.main").app


def _api_routes(app: FastAPI) -> list[APIRoute]:
    return [route for route in app.routes if isinstance(route, APIRoute)]


async def test_every_route_declares_exactly_one_access():
    offenders = [
        build_route_key(route.methods, route.path)
        for route in _api_routes(_app())
        if len(inspect_route_access(route)) != 1
    ]
    assert offenders == []


async def test_catalog_builds_and_route_check_has_no_errors():
    app = _app()
    catalog = build_catalog(app.state.plugins, collect_route_bindings(app.routes))
    errors = [
        f"{issue.route_key}: {issue.message}" for issue in check_routes(app.routes, catalog) if issue.level == "error"
    ]
    assert errors == []


async def test_public_routes_match_reviewed_snapshot():
    public = sorted(
        build_route_key(route.methods, route.path)
        for route in _api_routes(_app())
        if [access.kind for access in inspect_route_access(route)] == ["public"]
    )
    expected = [
        line for line in PUBLIC_SNAPSHOT.read_text(encoding="utf-8").splitlines() if line and not line.startswith("#")
    ]
    assert public == expected, "Public 接口发生变化，需要评审；确认后更新 tests/route_access_public.txt"
