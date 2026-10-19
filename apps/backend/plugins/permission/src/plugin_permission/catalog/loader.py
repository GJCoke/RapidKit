# apps/backend/plugins/permission/src/plugin_permission/catalog/loader.py
"""
从 FastAPI 应用构建权限码目录（供 initdb、迁移命令等无 lifespan 的场景使用）。

Author : Coke
Date   : 2026-10-17
"""

from fastapi import FastAPI
from fastapi.routing import APIRoute
from rapidkit_common.access import inspect_route_access
from starlette.routing import BaseRoute

from plugin_permission.catalog.registry import PermissionCatalog, build_catalog
from plugin_permission.catalog.route_check import collect_route_bindings
from plugin_permission.utils import build_route_key


def catalog_from_app(app: FastAPI) -> tuple[PermissionCatalog, dict[str, str]]:
    """
    按已加载插件与路由声明构建目录。

    Args:
        app: 已完成插件加载与路由注册的应用。

    Returns:
        (目录, route_key -> 声明码)。
    """
    bindings = collect_route_bindings(app.routes)
    return build_catalog(app.state.plugins, bindings), bindings


def collect_exempt_route_keys(routes: list[BaseRoute]) -> set[str]:
    """收集仅声明 ``Authenticated`` / ``Public`` 的接口 key，迁移时忽略这些旧授权。"""
    keys: set[str] = set()
    for route in routes:
        if not isinstance(route, APIRoute):
            continue
        kinds = {access.kind for access in inspect_route_access(route)}
        if "require" not in kinds and kinds & {"authenticated", "public"}:
            keys.add(build_route_key(route.methods, route.path))
    return keys
