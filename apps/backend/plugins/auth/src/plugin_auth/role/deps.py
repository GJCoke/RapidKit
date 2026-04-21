"""
Author  : Coke
Date    : 2025-04-24
"""

from uuid import UUID

from fastapi import Depends
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.enums import DataScope
from rapidkit_core.auth_config import auth_settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.status_codes import StatusCode
from typing_extensions import Annotated, Doc

from plugin_auth.auth.deps import UserDBDep
from plugin_auth.auth.models import User
from plugin_auth.role.crud import RoleCRUD
from plugin_auth.role.schemas import UserPermissionCache
from plugin_auth.router.deps import RequestRouterDep

permission_structure = "auth:permission:<{user_id}>"


async def get_role_crud(session: SessionDep) -> RoleCRUD:
    return RoleCRUD(session)


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

    # 聚合数据范围：多角色取最宽（数值最小 = 最宽）
    data_scope = DataScope.SELF
    if roles:
        data_scope = min(role.data_scope for role in roles)

    # 聚合自定义部门列表（并集）
    custom_dept_ids: list[UUID] = list(
        {
            dept_id
            for role in roles
            if role.data_scope == DataScope.CUSTOM_DEPT
            for dept_id in (role.custom_dept_ids or [])
        }
    )

    # 聚合数据规则 ID（并集）
    data_rule_ids: list[UUID] = list(
        {
            rule_id
            for role in roles
            if role.data_scope == DataScope.CUSTOM_RULE
            for rule_id in (role.data_rule_ids or [])
        }
    )

    cache = UserPermissionCache(
        permissions=permissions,
        buttons=buttons,
        data_scope=data_scope,
        custom_dept_ids=custom_dept_ids,
        data_rule_ids=data_rule_ids,
    )
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
