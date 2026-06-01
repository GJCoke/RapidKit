"""
Author  : Coke
Date    : 2025-04-24
"""

from uuid import UUID

from fastapi import Depends, Request
from rapidkit_common.auth import UserDBDep, UserProtocol
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from typing_extensions import Annotated, Doc

from plugin_permission.adapters import AuthRoleResolver, RedisPermissionCache
from plugin_permission.context import PermissionContext
from plugin_permission.data_policy.services import get_role_versions
from plugin_permission.providers import permission_structure
from plugin_permission.rbac import PermissionDenied, check_route_permission
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.crud import RoleCRUD
from plugin_permission.role.schemas import UserPermissionCache
from plugin_permission.router.deps import RequestRouterDep
from plugin_permission.status_codes import RbacStatusCode
from plugin_permission.utils import build_route_key


async def get_role_crud(session: SessionDep) -> RoleCRUD:
    return RoleCRUD(session)


RoleCrudDep = Annotated[
    RoleCRUD,
    Depends(get_role_crud),
    Doc("依赖项：用于访问 RoleCRUD 实例。"),
]


def _build_cache(redis: AsyncRedisClient) -> RedisPermissionCache:
    return RedisPermissionCache(redis, permission_structure, rbac_config.PERMISSION_CACHE_TTL)


async def create_user_permission_cache(
    user_id: UUID,
    codes: list[str],
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> UserPermissionCache:
    cache = _build_cache(redis)
    await cache.invalidate(user_id)

    resolver = AuthRoleResolver(role_crud, redis)
    permissions = await resolver.resolve(codes)
    await cache.set(user_id, permissions)
    return permissions


async def get_user_permission_cache(
    user: UserProtocol,
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> UserPermissionCache:
    cache = _build_cache(redis)
    cached = await cache.get(user.id)
    if cached:
        return cached
    return await create_user_permission_cache(user.id, user.roles, redis, role_crud)


async def verify_user_permission(
    request: Request,
    user: UserDBDep,
    route: RequestRouterDep,
    redis: RedisDep,
    role: RoleCrudDep,
) -> UserProtocol:
    if user.is_admin:
        return user

    cache = _build_cache(redis)
    cached = await cache.get(user.id)

    # Fetch current role versions (1 mget call)
    current_versions = await get_role_versions(redis, user.roles)

    # Staleness check
    if cached is not None:
        cached_versions = cached.role_versions
        stale = set(cached_versions.keys()) != set(current_versions.keys()) or any(
            cached_versions.get(k) != current_versions.get(k) for k in current_versions
        )
        if stale:
            cached = None

    # Rebuild if needed
    if cached is None:
        resolver = AuthRoleResolver(role, redis)
        cached = await resolver.resolve(user.roles)
        await cache.set(user.id, cached)

    # Route permission check
    route_key = build_route_key(route.methods, route.path)
    try:
        check_route_permission(cached.permissions, route_key, user.is_admin)
    except PermissionDenied:
        raise AppException(RbacStatusCode.ROLE_PERMISSION_DENIED)

    # Store PermissionContext on request for ABAC reuse
    request.state.permission_ctx = PermissionContext(
        user=user,
        cached_role_versions=cached.role_versions,
        current_role_versions=current_versions,
        data_policy_ids=list(cached.data_policy_ids),
        field_policy_ids=list(cached.field_policy_ids),
        permissions=cached.permissions,
        buttons=cached.buttons,
    )

    return user


VerifyPermissionDep = Annotated[
    UserProtocol,
    Depends(verify_user_permission),
    Doc("依赖项：校验用户权限。"),
]
