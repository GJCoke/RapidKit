"""
Author  : Coke
Date    : 2025-04-24
"""

from uuid import UUID

from fastapi import Depends
from typing_extensions import Annotated, Doc

from src.common.deps import RedisDep, SessionDep
from src.core.config import auth_settings
from src.core.exceptions import AppException
from src.core.redis_client import AsyncRedisClient
from src.core.status_codes import StatusCode
from src.domains.auth.deps import UserDBDep
from src.domains.auth.models import User
from src.domains.role.crud import RoleCRUD
from src.domains.role.models import Role
from src.domains.role.schemas import UserPermissionCache
from src.domains.router.deps import RequestRouterDep

permission_structure = "auth:permission:<{user_id}>"


async def get_role_crud(session: SessionDep) -> RoleCRUD:
    """
    返回初始化了指定会话的 RoleCRUD 实例。

    Args:
        session: 用于数据库操作的会话依赖。

    Returns:
        RoleCRUD: 以 Role 模型和指定会话初始化的 RoleCRUD 实例。
    """
    return RoleCRUD(Role, session=session)


RoleCrudDep = Annotated[
    RoleCRUD,
    Depends(get_role_crud),
    Doc(
        """
        依赖项：用于访问 RoleCRUD 实例。

        该依赖会注入用于操作角色数据模型的 RoleCRUD 实例，
        可在需要基于角色操作的路由中使用。
        """
    ),
]


async def create_user_permission_cache(
    user_id: UUID,
    codes: list[str],
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
) -> list[str]:
    """
    根据角色编码在 Redis 中创建并缓存用户权限。

    会先删除用户已有的权限缓存，
    然后获取所有角色对应的权限并存入 Redis，设置过期时间。

    Args:
        user_id: 用户唯一标识。
        codes: 用户拥有的角色编码列表。
        redis: 用于缓存权限的 Redis 客户端。
        role_crud: 用于查询角色信息的 CRUD 实例。

    Returns:
        list[str]: 权限编码列表。
    """
    redis_key = permission_structure.format(user_id=user_id)
    await redis.delete(redis_key)

    roles = await role_crud.get_role_by_codes(codes)
    user_permission_list = [permission for role_info in roles for permission in role_info.interface_permissions]
    if user_permission_list:
        await redis.set(
            redis_key,
            UserPermissionCache(permissions=user_permission_list),
            ex=auth_settings.ACCESS_TOKEN_EXP,
        )

    return user_permission_list


async def verify_user_permission(user: UserDBDep, route: RequestRouterDep, redis: RedisDep, role: RoleCrudDep) -> User:
    """
    校验用户是否有权限访问指定路由。

    若用户不是管理员，则从 Redis 或数据库获取权限，
    并校验当前路由是否在用户权限列表中。

    Args:
        user: 需要校验权限的用户。
        route: 用户尝试访问的路由。
        redis: Redis 依赖，用于缓存和获取权限。
        role: 角色权限相关的 CRUD 依赖。

    Raises:
        PermissionDeniedException: 用户无权限访问该路由时抛出。

    Returns:
        User: 用户模型。
    """
    if not user.is_admin:
        redis_key = permission_structure.format(user_id=user.id)
        cache = await redis.get(redis_key, response_model=UserPermissionCache)
        if cache:
            user_permission_list = cache.permissions
        else:
            user_permission_list = await create_user_permission_cache(user.id, user.roles, redis, role)

        route_key = f"{':'.join(route.methods)}:{route.path}"
        if route_key not in user_permission_list:
            raise AppException(StatusCode.ROLE_PERMISSION_DENIED)

    return user


VerifyPermissionDep = Annotated[
    User,
    Depends(verify_user_permission),
    Doc(
        """
        依赖项：调用 verify_user_permission 校验用户是否有权限访问指定路由。
        会自动从缓存（Redis）或数据库获取用户权限。
        """
    ),
]
