"""
Author  : Coke
Date    : 2025-04-24
"""

from uuid import UUID

from fastapi import Depends
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_core.auth_config import auth_settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.status_codes import StatusCode
from typing_extensions import Annotated, Doc

from plugin_auth.auth.deps import UserDBDep
from plugin_auth.auth.models import User
from plugin_auth.role.crud import RoleCRUD
from plugin_auth.role.models import Role
from plugin_auth.role.schemas import UserPermissionCache
from plugin_auth.router.deps import RequestRouterDep

permission_structure = "auth:permission:<{user_id}>"


async def get_role_crud(session: SessionDep) -> RoleCRUD:
    return RoleCRUD(Role, session=session)


RoleCrudDep = Annotated[
    RoleCRUD,
    Depends(get_role_crud),
    Doc("依赖项：用于访问 RoleCRUD 实例。"),
]


async def create_user_permission_cache(
    user_id: UUID,
    codes: list[str],
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> UserPermissionCache:
    redis_key = permission_structure.format(user_id=user_id)
    await redis.delete(redis_key)

    roles = await role_crud.get_role_by_codes(codes)
    permissions = [p for role_info in roles for p in role_info.interface_permissions]
    buttons = list({b for role_info in roles for b in (role_info.button_permissions or [])})

    cache = UserPermissionCache(permissions=permissions, buttons=buttons)
    if permissions or buttons:
        await redis.set(redis_key, cache, ex=auth_settings.ACCESS_TOKEN_EXP)

    return cache


async def verify_user_permission(user: UserDBDep, route: RequestRouterDep, redis: RedisDep, role: RoleCrudDep) -> User:
    if not user.is_admin:
        cache = await get_user_permission_cache(user, redis, role)

        route_key = f"{':'.join(route.methods)}:{route.path}"
        if route_key not in cache.permissions:
            raise AppException(StatusCode.ROLE_PERMISSION_DENIED)

    return user


async def get_user_permission_cache(
    user: User,
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> UserPermissionCache:
    redis_key = permission_structure.format(user_id=user.id)
    cache = await redis.get(redis_key, response_model=UserPermissionCache)
    if cache:
        return cache
    return await create_user_permission_cache(user.id, user.roles, redis, role_crud)


VerifyPermissionDep = Annotated[
    User,
    Depends(verify_user_permission),
    Doc("依赖项：校验用户权限。"),
]
