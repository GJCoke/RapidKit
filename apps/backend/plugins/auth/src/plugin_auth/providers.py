"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from authlib.jose.errors import ExpiredTokenError, JoseError
from rapidkit_common.protocols.user import UserProtocol, UserResolver
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from rapidkit_security import decode_token, decrypt_message, hash_password

from plugin_auth.auth_config import auth_settings

logger = get_plugin_logger("Auth")


class TokenDecoderImpl:
    """JWT token decoder — implements TokenDecoder protocol."""

    async def decode_user_id(self, token: str) -> UUID | None:
        try:
            jwt_data = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
            return jwt_data.sub
        except ExpiredTokenError, JoseError:
            return None


class AuthenticatorImpl:
    """Login authenticator — implements Authenticator protocol."""

    def __init__(self, user_resolver: UserResolver) -> None:
        self._user_resolver = user_resolver

    async def authenticate(self, username: str, password: str) -> str:
        """Authenticate user and return access token. Raises on failure."""
        raise NotImplementedError("Use login endpoint directly — full implementation pending")


class CurrentUserProviderImpl:
    """Resolve current user from token — implements CurrentUserProvider protocol."""

    def __init__(self, user_resolver: UserResolver) -> None:
        self._user_resolver = user_resolver

    async def get_current_user(self, token: str) -> UserProtocol | None:
        try:
            jwt_data = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
            user_id = jwt_data.sub if isinstance(jwt_data.sub, UUID) else UUID(jwt_data.sub)
            return await self._user_resolver.get_by_id(user_id)
        except ExpiredTokenError, JoseError:
            return None


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

    async def invalidate_permission_cache(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        redis_key = self.PERMISSION_CACHE_KEY.format(user_id=user_id)
        await redis.delete(redis_key)

    async def invalidate_user_cache(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        redis_key = self.USER_CACHE_KEY.format(user_id=user_id)
        await redis.delete(redis_key)
