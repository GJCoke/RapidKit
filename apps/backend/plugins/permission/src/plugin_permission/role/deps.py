"""
Author  : Coke
Date    : 2025-04-24
"""

from fastapi import Depends, Request
from rapidkit_common.auth import UserDBDep, UserProtocol
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from typing_extensions import Annotated, Doc

from plugin_permission.context import PermissionContext
from plugin_permission.rbac import PermissionDenied, check_route_permission
from plugin_permission.role.crud import RoleCRUD
from plugin_permission.role.schemas import UserPermissionCache
from plugin_permission.router.deps import RequestRouterDep
from plugin_permission.status_codes import RbacStatusCode
from plugin_permission.user_permissions import get_fresh_permissions
from plugin_permission.utils import build_route_key


async def get_role_crud(session: SessionDep) -> RoleCRUD:
    return RoleCRUD(session)


RoleCrudDep = Annotated[
    RoleCRUD,
    Depends(get_role_crud),
    Doc("依赖项：用于访问 RoleCRUD 实例。"),
]


async def get_user_permission_cache(
    user: UserProtocol,
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> UserPermissionCache:
    cached, _ = await get_fresh_permissions(user.id, user.roles, redis, role_crud)
    return cached


async def verify_user_permission(
    request: Request,
    user: UserDBDep,
    route: RequestRouterDep,
    redis: RedisDep,
    role: RoleCrudDep,
) -> UserProtocol:
    if user.is_admin:
        return user

    cached, current_versions = await get_fresh_permissions(user.id, user.roles, redis, role)

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
