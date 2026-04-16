"""
用户管理业务逻辑。

Author : Coke
Date   : 2026-04-02
"""

from uuid import UUID

from plugin_auth.auth.deps import refresh_structure
from plugin_auth.auth.models import User
from plugin_auth.auth.services import decrypt_password
from plugin_auth.role.deps import permission_structure
from rapidkit_common.enums import Status
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
        filters.append(
            or_(
                col(User.name).like(f"%{keyword}%"),
                col(User.username).like(f"%{keyword}%"),
                col(User.email).like(f"%{keyword}%"),
            )
        )

    return filters


def process_password(rsa_password: str) -> bytes:
    """解密 RSA 加密的密码并生成 bcrypt 哈希。"""
    decrypted = decrypt_password(rsa_password)
    return hash_password(decrypted)


async def invalidate_user_permission_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的权限缓存。"""
    redis_key = permission_structure.format(user_id=user_id)
    await redis.delete(redis_key)


async def invalidate_user_session(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的权限缓存和所有刷新令牌。"""
    await invalidate_user_permission_cache(redis, user_id)

    refresh_pattern = refresh_structure.format(user_id=user_id, jti="*")
    async for key in redis.scan_iter(match=refresh_pattern):
        await redis.delete(key)


async def invalidate_users_by_role_code(
    redis: AsyncRedisClient,
    role_code: str,
    session: AsyncSession,
) -> None:
    """根据角色编码查找所有拥有该角色的用户，并清除其权限缓存。"""
    result = await session.exec(select(User))
    users = result.all()
    for user in users:
        if role_code in (user.roles or []):
            await invalidate_user_permission_cache(redis, user.id)
