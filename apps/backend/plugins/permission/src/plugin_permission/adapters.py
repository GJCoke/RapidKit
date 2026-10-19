"""
Protocol adapter implementations for RBAC common modules.

Bridges the RBAC plugin's concrete infrastructure (Redis, RoleCRUD)
to the abstract Protocol interfaces defined in rapidkit_common.

Author : Coke
Date   : 2026-05-07
"""

from datetime import timedelta
from uuid import UUID

from rapidkit_core.redis_client import AsyncRedisClient

from plugin_permission.cache import CachedPermissions, PermissionCache
from plugin_permission.catalog.registry import get_catalog
from plugin_permission.catalog.runtime import ensure_catalog_fresh
from plugin_permission.catalog.version import get_permission_versions
from plugin_permission.role.crud import RoleCRUD
from plugin_permission.role_snapshots import load_role_snapshots
from plugin_permission.scope_rules import merge_role_scopes, resolve_role_scopes


class RedisPermissionCache(PermissionCache):
    """Adapts AsyncRedisClient to PermissionCache Protocol."""

    def __init__(self, redis: AsyncRedisClient, key_template: str, ttl: int | timedelta) -> None:
        self._redis = redis
        self._key_template = key_template
        self._ttl = ttl

    async def get(self, user_id: UUID) -> CachedPermissions | None:
        key = self._key_template.format(user_id=user_id)
        return await self._redis.get(key, response_model=CachedPermissions)

    async def set(self, user_id: UUID, data: CachedPermissions) -> None:
        key = self._key_template.format(user_id=user_id)
        await self._redis.set(key, data, ex=self._ttl)

    async def invalidate(self, user_id: UUID) -> None:
        key = self._key_template.format(user_id=user_id)
        await self._redis.delete(key)


class AuthRoleResolver:
    """Resolves role codes into aggregated CachedPermissions."""

    def __init__(self, role_crud: RoleCRUD, redis: AsyncRedisClient) -> None:
        self._crud = role_crud
        self._redis = redis

    async def resolve(self, role_codes: list[str]) -> CachedPermissions:
        role_versions, catalog_version = await get_permission_versions(self._redis, role_codes)
        await ensure_catalog_fresh(self._redis, self._crud.session, version=catalog_version)
        snapshots = await load_role_snapshots(self._redis, self._crud, role_versions, catalog_version)
        active = [s for s in snapshots if s.active]
        catalog = get_catalog()
        direct = {code for s in active for code in s.permission_codes}
        data_scopes, field_modes = merge_role_scopes(
            [resolve_role_scopes(s.data_scopes, s.field_modes, catalog) for s in active], catalog
        )
        return CachedPermissions(
            codes=sorted(catalog.expand(direct)),
            data_scopes=data_scopes,
            field_modes=field_modes,
            role_versions=role_versions,
            catalog_version=catalog_version,
        )
