"""
Author  : Coke
Date    : 2025-04-24
"""

from fastapi import Depends
from rapidkit_common.auth import UserProtocol
from rapidkit_common.deps import SessionDep
from rapidkit_core.redis_client import AsyncRedisClient
from typing_extensions import Annotated, Doc

from plugin_permission.role.crud import RoleCRUD
from plugin_permission.role.schemas import UserPermissionCache
from plugin_permission.user_permissions import get_fresh_permissions


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
