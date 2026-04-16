"""
User plugin — 用户管理。

Author  : Claude
Date    : 2026-04-14
"""

from rapidkit_core.events import RolePermissionsChangedEvent
from rapidkit_core.plugin import PluginManifest


async def _on_role_permissions_changed(event: RolePermissionsChangedEvent) -> None:
    """事件总线 role.permissions_changed 监听器。"""
    from rapidkit_core.database import AsyncSessionLocal, RedisManager

    from plugin_user.services import invalidate_users_by_role_code

    redis = RedisManager.client()
    async with AsyncSessionLocal() as session:
        await invalidate_users_by_role_code(redis, event.role_code, session)


def register() -> PluginManifest:
    from plugin_user.api import router

    return PluginManifest(
        name="user",
        version="0.1.0",
        router=router,
        models=[],
        dependencies=["auth", "system"],
        event_listeners=[(RolePermissionsChangedEvent, _on_role_permissions_changed)],
    )
