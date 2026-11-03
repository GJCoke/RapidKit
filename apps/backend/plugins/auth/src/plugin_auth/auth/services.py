"""
Authentication service layer.

Author  : Coke
Date    : 2025-04-18
"""

from uuid import UUID

from rapidkit_common.audit import current_audit
from rapidkit_common.enums import Status
from rapidkit_common.events import UserLoginEvent
from rapidkit_common.protocols.permission import PermissionCacheManager
from rapidkit_common.protocols.user import UserProtocol
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7
from rapidkit_framework.audit import AuditActorType
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
    except Exception as exc:
        logger.bind(
            event="auth.login.rejected",
            outcome="rejected",
            reason_code="password_decrypt_failed",
            exception_type=type(exc).__name__,
        ).warning("Password decryption rejected")
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
        logger.bind(event="auth.token.refresh", outcome="success", user_id=user.id).info("Access token refreshed")
        return token

    if await token_store.is_replay(user.id, jti):
        logger.bind(
            event="auth.token.refresh", outcome="rejected", reason_code="token_replay", user_id=user.id
        ).warning("Refresh token replay rejected")
        await token_store.force_relogin(user.id)
        raise AppException(AuthStatusCode.TOKEN_INVALID)

    logger.bind(event="auth.token.refresh", outcome="rejected", reason_code="token_missing", user_id=user.id).debug(
        "Refresh token unavailable"
    )
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
    audit_context = current_audit.get()
    if audit_context is not None:
        audit_context.record.metadata.attempted_username = username[:100]
    attempts_key = login_attempts_structure.format(username=username)
    attempts = await redis.get(attempts_key)
    if attempts and int(attempts) >= auth_settings.LOGIN_MAX_ATTEMPTS:
        retry_after_seconds = await _get_login_retry_after(redis, attempts_key)
        logger.bind(event="auth.login.rejected", outcome="rejected", reason_code="account_locked").warning(
            "Login temporarily limited"
        )
        raise AppException(AuthStatusCode.ACCOUNT_LOCKED, data={"retryAfterSeconds": retry_after_seconds})

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
        logger.bind(
            event="auth.login.rejected", outcome="rejected", reason_code="invalid_credentials", user_id=user_info.id
        ).warning("Login credentials rejected")
        raise AppException(AuthStatusCode.AUTHENTICATION_FAILED)

    # Fix 3: Clear login attempts on success
    await redis.delete(attempts_key)

    if user_info.status != Status.ON:
        if user_info.status == Status.PENDING:
            logger.bind(
                event="auth.login.rejected", outcome="rejected", reason_code="account_pending", user_id=user_info.id
            ).warning("Login status rejected")
            raise AppException(AuthStatusCode.ACCOUNT_NOT_ACTIVATED)
        logger.bind(
            event="auth.login.rejected", outcome="rejected", reason_code="account_disabled", user_id=user_info.id
        ).warning("Login status rejected")
        raise AppException(AuthStatusCode.USER_DISABLED)

    token = await token_store.issue(user_info.id, user_info.name, user_agent)
    cache_mgr = get_service(PermissionCacheManager)
    await cache_mgr.build(user_info.id, user_info.roles, redis)

    if audit_context is not None:
        audit_context.record.actor_id = user_info.id
        audit_context.record.actor_name = user_info.name
        audit_context.record.actor_username = user_info.username
        audit_context.record.actor_type = AuditActorType.USER
        audit_context.confirm()
    logger.bind(event="auth.login.completed", outcome="success", user_id=user_info.id).debug("Login completed")
    event_bus.fire_and_forget(
        UserLoginEvent(
            user_id=str(user_info.id),
            event_id=str(uuid7()),
            occurred_at=timezone.now(),
            actor_name=user_info.name,
        )
    )
    return token


async def _increment_login_attempts(redis: AsyncRedisClient, key: str) -> None:
    """Increment login failure count; set TTL on first failure."""
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, auth_settings.LOGIN_LOCKOUT_SECONDS)


async def _get_login_retry_after(redis: AsyncRedisClient, key: str) -> int:
    """Return a positive retry delay even when Redis has no usable TTL."""
    try:
        ttl = int(await redis.ttl(key))
    except Exception:
        logger.bind(event="auth.login.retry_delay", reason_code="ttl_unavailable").debug(
            "Using minimum login retry delay"
        )
        return 1
    return max(ttl, 1)
