"""
Authentication service layer.

Author  : Coke
Date    : 2025-04-18
"""

from uuid import UUID

from rapidkit_common.events import UserLoginEvent
from rapidkit_common.protocols.permission import PermissionCacheManager
from rapidkit_common.protocols.user import UserProtocol
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from rapidkit_security import check_password, decrypt_message, hash_password

from plugin_auth.auth.crud import UserCRUD
from plugin_auth.auth.schemas import TokenResponse
from plugin_auth.auth.token_store import TokenStore
from plugin_auth.auth_config import auth_settings
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")

login_attempts_structure = "auth:login_attempts:<{username}>"

# Pre-computed dummy hash for timing-consistent user enumeration prevention
_DUMMY_HASH = hash_password("dummy")


def decrypt_password(rsa_password: str) -> str:
    try:
        password = decrypt_message(auth_settings.RSA_PRIVATE_KEY, rsa_password)
    except Exception:
        logger.exception("Failed to decrypt password.")
        raise AppException(AuthStatusCode.AUTHENTICATION_FAILED)
    return password


async def refresh_user_token(
    jti: UUID,
    user: UserProtocol,
    token_store: TokenStore,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    if await token_store.is_valid(user.id, jti):
        token = await token_store.rotate(user.id, user.username, jti, user_agent)
        cache_mgr = get_service(PermissionCacheManager)
        await cache_mgr.build(user.id, user.roles, redis)
        logger.info("Token refreshed for user {user_id}", user_id=user.id)
        return token

    if await token_store.is_replay(user.id, jti):
        logger.warning("Refresh token replay detected for user {user_id}, forcing re-login", user_id=user.id)
        await token_store.force_relogin(user.id)
        raise AppException(AuthStatusCode.TOKEN_INVALID)

    logger.debug("No refresh token found in redis.")
    raise AppException(AuthStatusCode.TOKEN_EXPIRED)


async def user_login(
    username: str,
    password: str,
    *,
    user_crud: UserCRUD,
    token_store: TokenStore,
    redis: AsyncRedisClient,
    user_agent: str,
) -> TokenResponse:
    # Fix 3: Check login rate limit
    attempts_key = login_attempts_structure.format(username=username)
    attempts = await redis.get(attempts_key)
    if attempts and int(attempts) >= auth_settings.LOGIN_MAX_ATTEMPTS:
        logger.warning("Account locked due to too many failed attempts: {username}", username=username)
        raise AppException(AuthStatusCode.ACCOUNT_LOCKED)

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
        raise AppException(AuthStatusCode.AUTHENTICATION_FAILED)

    decrypted_password = decrypt_password(password)

    if not check_password(decrypted_password, user_info.password):
        await _increment_login_attempts(redis, attempts_key)
        logger.warning(
            "Login failed for {username}: invalid password, user_id={user_id}", username=username, user_id=user_info.id
        )
        raise AppException(AuthStatusCode.AUTHENTICATION_FAILED)

    # Fix 3: Clear login attempts on success
    await redis.delete(attempts_key)

    token = await token_store.issue(user_info.id, user_info.name, user_agent)
    cache_mgr = get_service(PermissionCacheManager)
    await cache_mgr.build(user_info.id, user_info.roles, redis)

    await token_store.clear_force_relogin(user_info.id)

    logger.info("Login success for user {user_id}", user_id=user_info.id)
    event_bus.fire_and_forget(UserLoginEvent(user_id=str(user_info.id)))
    return token


async def _increment_login_attempts(redis: AsyncRedisClient, key: str) -> None:
    """Increment login failure count; set TTL on first failure."""
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, auth_settings.LOGIN_LOCKOUT_SECONDS)
