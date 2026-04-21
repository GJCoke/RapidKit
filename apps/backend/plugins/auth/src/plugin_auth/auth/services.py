"""
Authentication service layer.

Author  : Coke
Date    : 2025-04-18
"""

import time
from uuid import UUID

from rapidkit_core.auth_config import auth_settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.security import AccessJWT, RefreshJWT, check_password, create_token, decrypt_message, hash_password
from rapidkit_core.status_codes import StatusCode
from rapidkit_core.uuid7 import uuid8

from plugin_auth.auth.crud import UserCRUD
from plugin_auth.auth.deps import force_relogin_structure, refresh_structure
from plugin_auth.auth.models import User
from plugin_auth.auth.schemas import RefreshTokenCache, TokenResponse
from plugin_auth.role.crud import RoleCRUD
from plugin_auth.role.deps import create_user_permission_cache

logger = get_plugin_logger("Auth")

login_attempts_structure = "auth:login_attempts:<{username}>"
used_refresh_structure = "auth:used_refresh:<{user_id}>:<{jti}>"

# Pre-computed dummy hash for timing-consistent user enumeration prevention
_DUMMY_HASH = hash_password("dummy")


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
        logger.exception("Failed to decrypt password.")
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
    used_key = used_refresh_structure.format(user_id=user.id, jti=jti)

    if await redis.exists(redis_key):
        # Normal refresh: delete old token, mark as used, issue new token
        await redis.delete(redis_key)
        await redis.set(used_key, "1", ex=auth_settings.REFRESH_TOKEN_EXP)

        token = await create_user_token(user.id, user.username, redis, user_agent)
        await create_user_permission_cache(user.id, user.roles, redis, role_crud)
        logger.info("Token refreshed for user {user_id}", user_id=user.id)
        return token

    # Fix 4: Token not found — check if it was already used (replay attack)
    if await redis.exists(used_key):
        logger.warning("Refresh token replay detected for user {user_id}, forcing re-login", user_id=user.id)
        relogin_key = force_relogin_structure.format(user_id=user.id)
        await redis.set(relogin_key, "1", ex=auth_settings.REFRESH_TOKEN_EXP)
        raise AppException(StatusCode.TOKEN_INVALID)

    # Token simply expired
    logger.debug("No refresh token found in redis.")
    raise AppException(StatusCode.TOKEN_EXPIRED)


async def user_login(
    username: str,
    password: str,
    *,
    user_crud: UserCRUD,
    role_crud: RoleCRUD,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    # Fix 3: Check login rate limit
    attempts_key = login_attempts_structure.format(username=username)
    attempts = await redis.get(attempts_key)
    if attempts and int(attempts) >= auth_settings.LOGIN_MAX_ATTEMPTS:
        logger.warning("Account locked due to too many failed attempts: {username}", username=username)
        raise AppException(StatusCode.ACCOUNT_LOCKED)

    # Fix 5: Prevent user enumeration — catch user-not-found and use dummy hash
    try:
        user_info = await user_crud.get_user_by_username(username)
    except AppException:
        try:
            decrypt_password(password)
        except AppException:
            pass
        check_password("dummy", _DUMMY_HASH)
        await _increment_login_attempts(redis, attempts_key)
        raise AppException(StatusCode.AUTHENTICATION_FAILED)

    decrypted_password = decrypt_password(password)

    if not check_password(decrypted_password, user_info.password):
        await _increment_login_attempts(redis, attempts_key)
        logger.warning(
            "Login failed for {username}: invalid password, user_id={user_id}", username=username, user_id=user_info.id
        )
        raise AppException(StatusCode.AUTHENTICATION_FAILED)

    # Fix 3: Clear login attempts on success
    await redis.delete(attempts_key)

    token = await create_user_token(user_info.id, user_info.name, redis, user_agent)
    await create_user_permission_cache(user_info.id, user_info.roles, redis, role_crud)

    relogin_key = force_relogin_structure.format(user_id=user_info.id)
    await redis.delete(relogin_key)

    logger.info("Login success for user {user_id}", user_id=user_info.id)
    return token


async def _increment_login_attempts(redis: AsyncRedisClient, key: str) -> None:
    """Increment login failure count; set TTL on first failure."""
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, auth_settings.LOGIN_LOCKOUT_SECONDS)
