"""
Authentication service layer

This module contains core authentication logic, including user login,
password decryption, and JWT token generation (access and refresh tokens).
It serves as the business logic layer between the API and the data access layer.

Author  : Coke
Date    : 2025-04-18
"""

import time
from uuid import UUID

from src.core.config import auth_settings
from src.core.exceptions import BadRequestException, PermissionDeniedException
from src.core.log import logger
from src.core.redis_client import AsyncRedisClient
from src.crud.auth import UserCRUD
from src.crud.role import RoleCRUD
from src.deps.auth import refresh_structure
from src.deps.role import create_user_permission_cache
from src.locales.i18n import t
from src.models import User
from src.schemas.auth import TokenResponse
from src.utils.security import AccessJWT, RefreshJWT, check_password, create_token, decrypt_message
from src.utils.uuid7 import uuid8


def create_access_token(user: AccessJWT) -> str:
    """
    为指定用户创建 JWT 访问令牌。

    Args:
        user: 包含用户身份信息的载荷。

    Returns:
        编码后的 JWT 访问令牌。
    """
    return create_token(
        user,
        auth_settings.ACCESS_TOKEN_EXP,
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )


def create_refresh_token(user: RefreshJWT) -> str:
    """
    为指定用户创建 JWT 刷新令牌。

    Args:
        user: 包含用户身份信息的载荷。

    Returns:
        编码后的 JWT 刷新令牌。
    """
    return create_token(
        user,
        auth_settings.REFRESH_TOKEN_EXP,
        auth_settings.REFRESH_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )


def decrypt_password(rsa_password: str) -> str:
    """
    使用配置的私钥解密 RSA 加密的密码。

    Args:
        rsa_password: 加密后的密码字符串（base64 编码）。

    Raises:
        BadRequestException: 解密失败时抛出。

    Returns:
        解密后的明文密码。
    """
    try:
        password = decrypt_message(auth_settings.RSA_PRIVATE_KEY, rsa_password)
    except Exception:
        logger.exception("Failed to decrypt password.", exc_info=True)
        raise BadRequestException(detail=t("auth.error.invalidCredentials"))

    return password


async def create_user_token(
    user_id: UUID,
    name: str,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    """
    为用户生成新的访问令牌和刷新令牌。

    创建访问令牌和刷新令牌对，将刷新令牌存入 Redis 并设置过期时间，返回包含两个令牌的 TokenResponse。

    Args:
        user_id: 用户 ID。
        name: 用户名。
        redis: 用于存储刷新令牌的 Redis 客户端。
        user_agent: 当前请求的 User-Agent，用于绑定刷新令牌到设备。

    Returns:
        包含访问令牌和刷新令牌的对象。
    """
    jti = str(uuid8())

    # access token
    token_info = {"sub": user_id, "name": name, "jti": jti}
    access = AccessJWT.model_validate(token_info)
    access_token = create_access_token(access)

    # refresh token
    redis_key = refresh_structure.format(user_id=user_id, jti=jti)
    refresh = RefreshJWT.model_validate({**token_info, "agent": user_agent})
    refresh_token = create_refresh_token(refresh)
    refresh_value = {
        "token": refresh_token,
        "agent": user_agent,
        "created_at": int(time.time()),
    }

    await redis.set(redis_key, refresh_value, ttl=auth_settings.REFRESH_TOKEN_EXP)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


async def refresh_user_token(
    jti: UUID,
    user: User,
    role_crud: RoleCRUD,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    """
    刷新用户的访问令牌和刷新令牌。

    校验 Redis 中刷新令牌的有效性，删除旧令牌防止复用，并生成新的访问令牌和刷新令牌。

    Args:
        jti: 当前刷新令牌的 JWT ID。
        user: 用户模型。
        role_crud: 角色相关操作的 CRUD 实例。
        redis: 用于令牌校验和存储的 Redis 客户端。
        user_agent: 请求头中的 user agent 字符串。

    Returns:
        新生成的访问令牌和刷新令牌对象。

    Raises:
        PermissionDeniedException: 刷新令牌无效或已过期时抛出。
    """
    redis_key = refresh_structure.format(user_id=user.id, jti=jti)
    if not await redis.exists(redis_key):
        logger.debug("No refresh token found in the redis.")
        raise PermissionDeniedException()

    await redis.delete(redis_key)

    token = await create_user_token(user.id, user.username, redis, user_agent)
    await create_user_permission_cache(user.id, user.roles, redis, role_crud)
    return token


async def user_login(
    username: str,
    password: str,
    *,
    user_crud: UserCRUD,
    role_crud: RoleCRUD,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    """
    用户认证并返回访问令牌和刷新令牌。

    Args:
        username: 客户端提供的用户名。
        password: 客户端提供的 RSA 加密密码。
        user_crud: 用户相关操作的 CRUD 实例。
        role_crud: 角色相关操作的 CRUD 实例。
        redis: 用于认证的 Redis 客户端。
        user_agent: 请求的 user agent。

    Raises:
        BadRequestException: 用户名不存在或密码错误时抛出。

    Returns:
        JWT 访问令牌和刷新令牌。
    """

    user_info = await user_crud.get_user_by_username(username)

    decrypted_password = decrypt_password(password)

    if not check_password(decrypted_password, user_info.password):
        logger.debug("Invalid password for user %s", username)
        raise BadRequestException(detail=t("auth.error.invalidCredentials"))

    token = await create_user_token(user_info.id, user_info.name, redis, user_agent)
    await create_user_permission_cache(user_info.id, user_info.roles, redis, role_crud)
    return token
