"""
用户管理业务逻辑。

Author : Coke
Date   : 2026-04-02
"""

from uuid import UUID

from plugin_auth.auth.deps import force_relogin_structure, refresh_structure, user_structure
from plugin_auth.auth.models import User
from plugin_auth.auth.services import decrypt_password
from plugin_auth.role.deps import permission_structure
from rapidkit_common.enums import Status
from rapidkit_core.auth_config import auth_settings
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.security import hash_password
from sqlalchemy import ColumnElement
from sqlmodel import col, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession


def filter_user(status: Status | None, keyword: str) -> list[ColumnElement[bool]]:
    """生成用于查询用户的 SQLAlchemy 过滤条件。"""
    filters: list[ColumnElement[bool]] = []

    if status is not None:
        filters.append(col(User.status) == status)

    if keyword:
        escaped = keyword.replace("%", r"\%").replace("_", r"\_")
        filters.append(
            or_(
                col(User.name).like(f"%{escaped}%"),
                col(User.username).like(f"%{escaped}%"),
                col(User.email).like(f"%{escaped}%"),
            )
        )

    return filters


def process_password(rsa_password: str) -> bytes:
    """解密 RSA 加密的密码并生成 bcrypt 哈希。"""
    decrypted = decrypt_password(rsa_password)
    return hash_password(decrypted)


async def invalidate_user_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的信息缓存。"""
    redis_key = user_structure.format(user_id=user_id)
    await redis.delete(redis_key)


async def invalidate_user_permission_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的权限缓存。"""
    redis_key = permission_structure.format(user_id=user_id)
    await redis.delete(redis_key)


async def invalidate_user_session(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的权限缓存、所有刷新令牌，并标记强制重新登录。"""
    await invalidate_user_permission_cache(redis, user_id)

    refresh_pattern = refresh_structure.format(user_id=user_id, jti="*")
    async for key in redis.scan_iter(match=refresh_pattern):
        await redis.delete(key)

    relogin_key = force_relogin_structure.format(user_id=user_id)
    await redis.set(relogin_key, "1", ex=auth_settings.ACCESS_TOKEN_EXP)


async def invalidate_users_by_role_code(
    redis: AsyncRedisClient,
    role_code: str,
    session: AsyncSession,
) -> None:
    """根据角色编码查找所有拥有该角色的用户，并清除其权限缓存。"""
    result = await session.exec(select(User.id).where(col(User.roles).contains(role_code)))
    for user_id in result.all():
        await invalidate_user_permission_cache(redis, user_id)
