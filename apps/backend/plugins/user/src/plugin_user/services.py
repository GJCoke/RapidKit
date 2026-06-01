"""
用户管理业务逻辑。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.protocols.auth import PasswordDecryptor, SessionInvalidator
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.services import get_service
from sqlalchemy import ColumnElement
from sqlmodel import col, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_user.models import User

logger = get_plugin_logger("User")


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
    decryptor = get_service(PasswordDecryptor)
    return decryptor.decrypt_and_hash(rsa_password)


def decrypt_user_password(rsa_password: str) -> str:
    """解密 RSA 加密的密码并返回明文。"""
    decryptor = get_service(PasswordDecryptor)
    return decryptor.decrypt(rsa_password)


async def invalidate_user_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的信息缓存。"""
    invalidator = get_service(SessionInvalidator)
    await invalidator.invalidate_user_cache(user_id, redis)


async def invalidate_user_permission_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的权限缓存。"""
    invalidator = get_service(SessionInvalidator)
    await invalidator.invalidate_permission_cache(user_id, redis)


async def invalidate_user_session(redis: AsyncRedisClient, user_id: UUID) -> None:
    """清除指定用户的权限缓存、所有刷新令牌，并标记强制重新登录。"""
    invalidator = get_service(SessionInvalidator)
    await invalidator.invalidate_user_sessions(user_id, redis)


async def invalidate_users_by_role_code(
    redis: AsyncRedisClient,
    role_code: str,
    session: AsyncSession,
) -> None:
    """根据角色编码查找所有拥有该角色的用户，并清除其权限缓存。"""
    result = await session.exec(select(User.id).where(col(User.roles).contains(role_code)))
    for user_id in result.all():
        await invalidate_user_permission_cache(redis, user_id)
