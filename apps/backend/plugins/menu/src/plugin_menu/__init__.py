"""
Menu & Route plugin — 菜单管理与前端动态路由。

Author  : Claude
Date    : 2026-04-14
"""

from rapidkit_common.events import RolePermissionsChangedEvent
from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_menu.providers import MenuNavigationProvider as NavigationProvider


async def _on_role_permissions_changed(event: RolePermissionsChangedEvent) -> None:
    """角色权限变更或删除时递增菜单缓存版本。"""
    from rapidkit_core.database import RedisManager

    from plugin_menu.services import invalidate_menu_cache

    redis = RedisManager.client()
    await invalidate_menu_cache(redis)


def register_services(registry: ServiceRegistry) -> None:
    registry.register(MenuNavigationProvider, NavigationProvider())


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
        dependencies=["permission"],
        provides=[MenuNavigationProvider],
        service_factories={MenuNavigationProvider: register_services},
        event_listeners=[
            (RolePermissionsChangedEvent, _on_role_permissions_changed),
        ],
    )
