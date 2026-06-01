"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient

from plugin_permission.adapters import AuthRoleResolver, RedisPermissionCache
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.crud import RoleCRUD

logger = get_plugin_logger("Permission")

permission_structure = "auth:permission:<{user_id}>"


class PermissionCacheManagerImpl:
    """Manage user permission cache — implements PermissionCacheManager protocol."""

    def __init__(self, session_factory=AsyncSessionLocal):
        self._session_factory = session_factory

    def _build_cache(self, redis: AsyncRedisClient) -> RedisPermissionCache:
        return RedisPermissionCache(redis, permission_structure, rbac_config.PERMISSION_CACHE_TTL)

    async def build(self, user_id: UUID, roles: list[str], redis: AsyncRedisClient) -> None:
        cache = self._build_cache(redis)
        await cache.invalidate(user_id)

        async with self._session_factory() as session:
            role_crud = RoleCRUD(session)
            resolver = AuthRoleResolver(role_crud, redis)
            permissions = await resolver.resolve(roles)
            await cache.set(user_id, permissions)

    async def get_buttons(self, user_id: UUID, roles: list[str], redis: AsyncRedisClient) -> list[str]:
        cache = self._build_cache(redis)
        cached = await cache.get(user_id)
        if cached:
            return cached.buttons

        async with self._session_factory() as session:
            role_crud = RoleCRUD(session)
            resolver = AuthRoleResolver(role_crud, redis)
            permissions = await resolver.resolve(roles)
            await cache.set(user_id, permissions)
            return permissions.buttons

    async def invalidate(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        cache = self._build_cache(redis)
        await cache.invalidate(user_id)

    async def get_permitted_routes(self, roles: list[str]) -> set[str]:
        async with self._session_factory() as session:
            role_crud = RoleCRUD(session)
            role_objs = await role_crud.get_role_by_codes(roles)
            permitted: set[str] = set()
            for role in role_objs:
                permitted.update(role.router_permissions or [])
            return permitted
