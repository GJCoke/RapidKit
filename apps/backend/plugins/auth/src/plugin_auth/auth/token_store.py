"""
Token lifecycle management.

Encapsulates all Redis operations for refresh tokens:
issue, rotate, revoke, revoke-all, validity check, replay detection.

Author : Coke
Date   : 2026-05-07
"""

import time
from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.uuid7 import uuid8
from rapidkit_security import AccessJWT, RefreshJWT, create_token

from plugin_auth.auth.schemas import RefreshTokenCache, TokenResponse
from plugin_auth.auth_config import auth_settings

logger = get_plugin_logger("Auth")

_REFRESH_KEY = "auth:refresh:<{user_id}>:<{jti}>"
_USED_KEY = "auth:used_refresh:<{user_id}>:<{jti}>"
_FORCE_RELOGIN_KEY = "auth:force_relogin:<{user_id}>"


class TokenStore:
    """Deep module managing the full token lifecycle in Redis."""

    def __init__(self, redis: AsyncRedisClient) -> None:
        self._redis = redis

    async def issue(self, user_id: UUID, username: str, user_agent: str) -> TokenResponse:
        """Issue a new access + refresh token pair."""
        jti = str(uuid8())
        token_info = {"sub": user_id, "name": username, "jti": jti}

        access = AccessJWT.model_validate(token_info)
        access_token = create_token(
            access, auth_settings.ACCESS_TOKEN_EXP, auth_settings.ACCESS_TOKEN_KEY, auth_settings.JWT_ALG
        )

        refresh = RefreshJWT.model_validate({**token_info, "agent": user_agent})
        refresh_token = create_token(
            refresh, auth_settings.REFRESH_TOKEN_EXP, auth_settings.REFRESH_TOKEN_KEY, auth_settings.JWT_ALG
        )

        cache = RefreshTokenCache(token=refresh_token, agent=user_agent, created_at=int(time.time()))
        redis_key = _REFRESH_KEY.format(user_id=user_id, jti=jti)
        await self._redis.set(redis_key, cache, ex=auth_settings.REFRESH_TOKEN_EXP)

        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    async def rotate(self, user_id: UUID, username: str, old_jti: UUID, user_agent: str) -> TokenResponse:
        """Rotate: invalidate old refresh token, mark as used, issue new pair."""
        old_key = _REFRESH_KEY.format(user_id=user_id, jti=old_jti)
        used_key = _USED_KEY.format(user_id=user_id, jti=old_jti)

        await self._redis.delete(old_key)
        await self._redis.set(used_key, "1", ex=auth_settings.REFRESH_TOKEN_EXP)

        return await self.issue(user_id, username, user_agent)

    async def revoke(self, user_id: UUID, jti: UUID) -> None:
        """Revoke a single refresh token (single device logout)."""
        key = _REFRESH_KEY.format(user_id=user_id, jti=jti)
        await self._redis.delete(key)

    async def revoke_all(self, user_id: UUID) -> None:
        """Revoke all refresh tokens for a user (force re-login on all devices)."""
        pattern = f"auth:refresh:<{user_id}>:*"
        keys = await self._redis.keys(pattern)
        if keys:
            await self._redis.delete(*keys)
        relogin_key = _FORCE_RELOGIN_KEY.format(user_id=user_id)
        await self._redis.set(relogin_key, "1", ex=auth_settings.REFRESH_TOKEN_EXP)

    async def is_valid(self, user_id: UUID, jti: UUID) -> bool:
        """Check if a refresh token is still valid in Redis."""
        key = _REFRESH_KEY.format(user_id=user_id, jti=jti)
        return bool(await self._redis.exists(key))

    async def is_replay(self, user_id: UUID, jti: UUID) -> bool:
        """Detect refresh token replay (already consumed token reused)."""
        used_key = _USED_KEY.format(user_id=user_id, jti=jti)
        return bool(await self._redis.exists(used_key))

    async def force_relogin(self, user_id: UUID) -> None:
        """Force a user to re-login (invalidates all active access tokens)."""
        relogin_key = _FORCE_RELOGIN_KEY.format(user_id=user_id)
        await self._redis.set(relogin_key, "1", ex=auth_settings.REFRESH_TOKEN_EXP)

    async def clear_force_relogin(self, user_id: UUID) -> None:
        """Clear the force-relogin flag (called after successful login)."""
        relogin_key = _FORCE_RELOGIN_KEY.format(user_id=user_id)
        await self._redis.delete(relogin_key)

    async def clear_user_cache(self, user_id: UUID) -> None:
        """Clear the user info cache."""
        key = f"auth:user:<{user_id}>"
        await self._redis.delete(key)
