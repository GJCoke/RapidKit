"""
Menu & Route plugin — 菜单管理与前端动态路由。

Author  : Claude
Date    : 2026-04-14
"""

from rapidkit_common.events import RolePermissionsChangedEvent, UserRolesChangedEvent
from rapidkit_framework.plugin import PluginManifest


async def _on_role_permissions_changed(event: RolePermissionsChangedEvent) -> None:
    """角色权限变更时清除用户路由缓存。"""
    from rapidkit_core.database import RedisManager

    from plugin_menu.services import invalidate_menu_cache

    redis = RedisManager.client()
    await invalidate_menu_cache(redis)


async def _on_user_roles_changed(event: UserRolesChangedEvent) -> None:
    """用户角色变更时清除菜单缓存。"""
    from rapidkit_core.database import RedisManager

    from plugin_menu.services import invalidate_menu_cache

    redis = RedisManager.client()
    await invalidate_menu_cache(redis)


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
        event_listeners=[
            (RolePermissionsChangedEvent, _on_role_permissions_changed),
            (UserRolesChangedEvent, _on_user_roles_changed),
        ],
    )
