"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.protocols.user import UserResolver
from rapidkit_common.schemas.auth import AuthUser
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from rapidkit_security import decrypt_message, hash_password

from plugin_auth.auth.token_store import TokenStore
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

    async def get_auth_context(self, token, *, fresh=False):
        try:
            return await self.resolver.resolve(token, fresh=fresh)
        except AppException:
            return None

    async def get_current_user(self, token: str) -> AuthUser | None:
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

    USER_CACHE_KEY = "auth:user:<{user_id}>"
    PERMISSION_CACHE_KEY = "auth:permission:<{user_id}>"

    async def invalidate_user_sessions(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        await self.invalidate_permission_cache(user_id, redis)
        await TokenStore(redis).revoke_all(user_id)

    async def invalidate_permission_cache(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        redis_key = self.PERMISSION_CACHE_KEY.format(user_id=user_id)
        await redis.delete(redis_key)

    async def invalidate_user_cache(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        redis_key = self.USER_CACHE_KEY.format(user_id=user_id)
        await redis.delete(redis_key)
