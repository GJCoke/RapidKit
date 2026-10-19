"""
用户权限缓存读取：按角色版本与目录版本比对，过期或缺失即重建并写回。

Author : Coke
Date   : 2026-10-15
"""

from uuid import UUID

from rapidkit_core.redis_client import AsyncRedisClient

from plugin_permission.adapters import AuthRoleResolver, RedisPermissionCache
from plugin_permission.cache import CachedPermissions, permission_structure
from plugin_permission.catalog.runtime import ensure_catalog_fresh
from plugin_permission.catalog.version import get_permission_versions
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.crud import RoleCRUD


def build_permission_cache(redis: AsyncRedisClient) -> RedisPermissionCache:
    """用户权限缓存适配器。"""
    return RedisPermissionCache(redis, permission_structure, rbac_config.PERMISSION_CACHE_TTL)


async def get_fresh_permissions(
    user_id: UUID,
    roles: list[str],
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> tuple[CachedPermissions, dict[str, int]]:
    """
    返回与当前角色版本一致的用户权限。

    Args:
        user_id: 用户 ID。
        roles: 用户角色编码。
        redis: AsyncRedisClient 实例。
        role_crud: 角色 CRUD，用于缓存重建。

    Returns:
        (权限缓存, 当前角色版本)。
    """
    cache = build_permission_cache(redis)
    cached = await cache.get(user_id)
    current_versions, catalog_version = await get_permission_versions(redis, roles)
    await ensure_catalog_fresh(redis, role_crud.session, version=catalog_version)
    if cached is not None and cached.role_versions == current_versions and cached.catalog_version == catalog_version:
        return cached, current_versions

    permissions = await AuthRoleResolver(role_crud, redis).resolve(roles)
    await cache.set(user_id, permissions)
    return permissions, permissions.role_versions
