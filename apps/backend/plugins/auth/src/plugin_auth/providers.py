"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.protocols.auth import UserSocketCloser
from rapidkit_common.protocols.impersonation import ImpersonationRevoker
from rapidkit_common.protocols.user import UserProtocol, UserResolver
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service_optional
from rapidkit_framework.status_codes import StatusCode
from rapidkit_security import decrypt_message, hash_password

from plugin_auth.auth_config import auth_settings

logger = get_plugin_logger("Auth")


class TokenDecoderImpl:
    def __init__(self, resolver):
        self.resolver = resolver

    async def decode_user_id(self, token: str) -> UUID | None:
        try:
            return (await self.resolver.resolve(token)).subject.id
        except AppException:
            return None


class AuthenticatorImpl:
    """Login authenticator — implements Authenticator protocol."""

    def __init__(self, user_resolver: UserResolver) -> None:
        self._user_resolver = user_resolver

    async def authenticate(self, username: str, password: str) -> str:
        """Authenticate user and return access token. Raises on failure."""
        raise NotImplementedError("Use login endpoint directly — full implementation pending")


class CurrentUserProviderImpl:
    def __init__(self, resolver):
        self.resolver = resolver

    async def get_auth_context(self, token):
        try:
            return await self.resolver.resolve(token)
        except AppException:
            return None

    async def get_current_user(self, token: str) -> UserProtocol | None:
        auth = await self.get_auth_context(token)
        return auth.subject if auth else None


class PasswordDecryptorImpl:
    """RSA password decryptor — implements PasswordDecryptor protocol."""

    def decrypt(self, encrypted_password: str) -> str:
        try:
            return decrypt_message(auth_settings.RSA_PRIVATE_KEY, encrypted_password)
        except Exception:
            raise AppException(StatusCode.BAD_REQUEST)

    def decrypt_and_hash(self, encrypted_password: str) -> bytes:
        plaintext = self.decrypt(encrypted_password)
        return hash_password(plaintext)


class SessionInvalidatorImpl:
    """Concrete implementation — manages auth Redis key namespace for session invalidation."""

    REFRESH_KEY = "auth:refresh:<{user_id}>:<{jti}>"
    USER_CACHE_KEY = "auth:user:<{user_id}>"
    FORCE_RELOGIN_KEY = "auth:force_relogin:<{user_id}>"
    PERMISSION_CACHE_KEY = "auth:permission:<{user_id}>"
    CACHE_TTL = 86400

    async def invalidate_user_sessions(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        await self.invalidate_permission_cache(user_id, redis)
        refresh_pattern = self.REFRESH_KEY.format(user_id=user_id, jti="*")
        async for key in redis.scan_iter(match=refresh_pattern):
            await redis.delete(key)
        relogin_key = self.FORCE_RELOGIN_KEY.format(user_id=user_id)
        await redis.set(relogin_key, "1", ex=self.CACHE_TTL)
        revoker = get_service_optional(ImpersonationRevoker)
        if revoker is not None:
            await revoker.revoke_user(user_id, redis)
        closer = get_service_optional(UserSocketCloser)
        if closer is not None:
            await closer.close_user(user_id, redis)

    async def invalidate_permission_cache(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        redis_key = self.PERMISSION_CACHE_KEY.format(user_id=user_id)
        await redis.delete(redis_key)

    async def invalidate_user_cache(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        redis_key = self.USER_CACHE_KEY.format(user_id=user_id)
        await redis.delete(redis_key)
