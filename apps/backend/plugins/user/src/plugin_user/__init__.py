"""
User plugin — 用户管理。

Author  : Claude
Date    : 2026-04-14
"""

from rapidkit_core.plugin import PluginManifest


async def _on_role_permissions_changed(data: dict) -> None:
    """事件总线 role.permissions_changed 监听器。"""
    from plugin_user.services import invalidate_users_by_role_code

    await invalidate_users_by_role_code(data["redis"], data["role_code"], data["session"])


def register() -> PluginManifest:
    from plugin_user.api import router

    return PluginManifest(
        name="user",
        version="0.1.0",
        router=router,
        models=[],
        dependencies=["auth", "system"],
        event_listeners=[("role.permissions_changed", _on_role_permissions_changed)],
    )
