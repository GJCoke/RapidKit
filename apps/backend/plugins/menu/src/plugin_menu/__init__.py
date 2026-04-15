"""
Menu & Route plugin — 菜单管理与前端动态路由。

Author  : Claude
Date    : 2026-04-14
"""

from rapidkit_core.plugin import PluginManifest


def register() -> PluginManifest:
    from fastapi import APIRouter

    from plugin_menu.api import router as menu_router
    from plugin_menu.models import Menu
    from plugin_menu.route_api import router as route_router

    combined = APIRouter()
    combined.include_router(menu_router)
    combined.include_router(route_router)

    return PluginManifest(
        name="menu",
        version="0.1.0",
        router=combined,
        models=[Menu],
        dependencies=["auth"],
    )
