"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.scopes import RestrictedMode

from plugin_permission.adapters import AuthRoleResolver, RedisPermissionCache
from plugin_permission.cache import permission_structure
from plugin_permission.catalog.registry import get_catalog
from plugin_permission.catalog.version import read_catalog_version
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.crud import RoleCRUD
from plugin_permission.scope_rules import restricted_fields
from plugin_permission.user_permissions import get_fresh_permissions

logger = get_plugin_logger("Permission")


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
        """返回展开后的权限码。"""
        async with self._session_factory() as session:
            permissions, _ = await get_fresh_permissions(user_id, roles, redis, RoleCRUD(session))
        return sorted(permissions.codes)

    async def get_restricted_fields(
        self, user_id: UUID, roles: list[str], redis: AsyncRedisClient
    ) -> dict[str, dict[str, RestrictedMode]]:
        """返回 资源 → 字段 → 受控状态，供前端禁用受控字段。"""
        async with self._session_factory() as session:
            permissions, _ = await get_fresh_permissions(user_id, roles, redis, RoleCRUD(session))
        return restricted_fields(get_catalog(), permissions.field_modes)

    async def invalidate(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        cache = self._build_cache(redis)
        await cache.invalidate(user_id)

    async def get_role_codes(self, roles: list[str]) -> set[str]:
        redis = RedisManager.client()
        async with self._session_factory() as session:
            permissions = await AuthRoleResolver(RoleCRUD(session), redis).resolve(roles)
        return set(permissions.codes)

    async def get_catalog_version(self) -> int:
        return await read_catalog_version(RedisManager.client())


class PermissionCatalogReaderImpl:
    """Read the effective catalog — implements PermissionCatalogReader protocol."""

    def has_code(self, code: str) -> bool:
        return code in get_catalog().codes
