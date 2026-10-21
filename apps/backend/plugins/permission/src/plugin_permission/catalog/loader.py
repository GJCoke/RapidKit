# apps/backend/plugins/permission/src/plugin_permission/catalog/loader.py
"""
从 FastAPI 应用构建权限码目录（供 initdb 等无 lifespan 的场景使用）。

Author : Coke
Date   : 2026-10-17
"""

from fastapi import FastAPI

from plugin_permission.catalog.registry import PermissionCatalog, build_catalog
from plugin_permission.catalog.route_check import collect_route_bindings


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
