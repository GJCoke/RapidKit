"""
Authentication service layer.

Author  : Coke
Date    : 2025-04-18
"""

import time
from uuid import UUID

from rapidkit_core.auth_config import auth_settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.log import logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.status_codes import StatusCode
from plugin_auth.auth.crud import UserCRUD
from plugin_auth.auth.deps import refresh_structure
from plugin_auth.auth.models import User
from plugin_auth.auth.schemas import RefreshTokenCache, TokenResponse
from plugin_auth.role.crud import RoleCRUD
from plugin_auth.role.deps import create_user_permission_cache
from rapidkit_core.security import AccessJWT, RefreshJWT, check_password, create_token, decrypt_message
from rapidkit_core.uuid7 import uuid8


def create_access_token(user: AccessJWT) -> str:
    return create_token(
        user,
        auth_settings.ACCESS_TOKEN_EXP,
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )


def create_refresh_token(user: RefreshJWT) -> str:
    return create_token(
        user,
        auth_settings.REFRESH_TOKEN_EXP,
        auth_settings.REFRESH_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )


def decrypt_password(rsa_password: str) -> str:
    try:
        password = decrypt_message(auth_settings.RSA_PRIVATE_KEY, rsa_password)
    except Exception:
        logger.exception("Failed to decrypt password.", exc_info=True)
        raise AppException(StatusCode.AUTHENTICATION_FAILED)
    return password


async def create_user_token(
    user_id: UUID,
    name: str,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    jti = str(uuid8())

    token_info = {"sub": user_id, "name": name, "jti": jti}
    access = AccessJWT.model_validate(token_info)
    access_token = create_access_token(access)

    redis_key = refresh_structure.format(user_id=user_id, jti=jti)
    refresh = RefreshJWT.model_validate({**token_info, "agent": user_agent})
    refresh_token = create_refresh_token(refresh)
    refresh_cache = RefreshTokenCache(
        token=refresh_token,
        agent=user_agent,
        created_at=int(time.time()),
    )

    await redis.set(redis_key, refresh_cache, ex=auth_settings.REFRESH_TOKEN_EXP)

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
    redis_key = refresh_structure.format(user_id=user.id, jti=jti)
    if not await redis.exists(redis_key):
        logger.debug("No refresh token found in the redis.")
        raise AppException(StatusCode.TOKEN_EXPIRED)

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
    user_info = await user_crud.get_user_by_username(username)

    decrypted_password = decrypt_password(password)

    if not check_password(decrypted_password, user_info.password):
        logger.debug("Invalid password for user %s", username)
        raise AppException(StatusCode.AUTHENTICATION_FAILED)

    token = await create_user_token(user_info.id, user_info.name, redis, user_agent)
    await create_user_permission_cache(user_info.id, user_info.roles, redis, role_crud)
    return token
