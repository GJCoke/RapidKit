"""
Token lifecycle management.

Encapsulates all Redis operations for refresh tokens:
issue, rotate, revoke, revoke-all, validity check, replay detection.

Author : Coke
Date   : 2026-05-07
"""

import asyncio
import math
import time
from uuid import UUID

from authlib.jose.errors import JoseError
from pydantic import ValidationError
from rapidkit_common.protocols.auth import UserSocketCloser
from rapidkit_common.protocols.impersonation import ImpersonationRevoker
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.uuid7 import uuid8
from rapidkit_framework.services import get_service_optional
from rapidkit_security import AccessJWT, RefreshJWT, create_token, decode_token

from plugin_auth.auth.schemas import RefreshTokenCache, TokenResponse
from plugin_auth.auth_config import auth_settings

logger = get_plugin_logger("Auth")

_REFRESH_KEY = "auth:refresh:<{user_id}>:<{jti}>"
_USED_KEY = "auth:used_refresh:<{user_id}>:<{jti}>"
REVOKED_BEFORE_KEY = "auth:revoked_before:{user_id}"
ACCESS_REVOKED_KEY = "auth:access_revoked:{jti}"
LEGACY_RELOGIN_KEY = "auth:force_relogin:<{user_id}>"
_ADVANCE_CUTOFF = """
local cutoff = math.max(tonumber(redis.call('GET', KEYS[1]) or '0'), tonumber(ARGV[1]))
redis.call('SET', KEYS[1], string.format('%.0f', cutoff), 'EX', ARGV[2])
return cutoff
"""


def issued_before_revocation(
    iat: float | None, cutoff: str | bytes | int | None, legacy: str | bytes | int | None = None
) -> bool:
    return (cutoff is not None and (iat is None or iat * 1000 < int(cutoff))) or (iat is None and bool(legacy))


class TokenStore:
    """Deep module managing the full token lifecycle in Redis."""

    def __init__(self, redis: AsyncRedisClient) -> None:
        self._redis = redis

    async def issue(self, user_id: UUID, username: str, user_agent: str) -> TokenResponse:
        """Issue a new access + refresh token pair."""
        cutoff = await self._redis.get(REVOKED_BEFORE_KEY.format(user_id=user_id))
        if cutoff is not None:
            while (delay := int(cutoff) / 1000 - time.time()) >= 0:
                await asyncio.sleep(delay + 0.000001)
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
        await self.force_relogin(user_id)
        cutoff = await self._redis.get(REVOKED_BEFORE_KEY.format(user_id=user_id))
        pattern = f"auth:refresh:<{user_id}>:*"
        batch = []
        async for key in self._redis.scan_iter(match=pattern, count=100):
            batch.append(key)
            if len(batch) == 100:
                await self._revoke_refresh_batch(batch, cutoff)
                batch = []
        if batch:
            await self._revoke_refresh_batch(batch, cutoff)

    async def _revoke_refresh_batch(self, keys: list, cutoff: str | None) -> None:
        """Keep sessions issued after the cutoff while a scan is in progress."""
        stale = []
        for key, value in zip(keys, await self._redis.mget(keys), strict=True):
            if value is None:
                continue
            try:
                cached = RefreshTokenCache.model_validate_json(value)
                claims = decode_token(cached.token, auth_settings.REFRESH_TOKEN_KEY)
            except JoseError, ValidationError:
                stale.append(key)
            else:
                if issued_before_revocation(claims.iat, cutoff):
                    stale.append(key)
        if stale:
            await self._redis.delete(*stale)

    async def is_revoked(self, user_id: UUID, jti: UUID, iat: float | None) -> bool:
        cutoff, blacklisted, legacy = await self._redis.mget(
            [
                REVOKED_BEFORE_KEY.format(user_id=user_id),
                ACCESS_REVOKED_KEY.format(jti=jti),
                LEGACY_RELOGIN_KEY.format(user_id=user_id),
            ]
        )
        return bool(blacklisted) or issued_before_revocation(iat, cutoff, legacy)

    async def revoke_access(self, jti: UUID, exp: float) -> None:
        ttl = math.ceil(exp - time.time())
        if ttl > 0:
            await self._redis.set(ACCESS_REVOKED_KEY.format(jti=jti), "1", ex=ttl)

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
        await self._redis.eval(  # ty: ignore[invalid-await]
            _ADVANCE_CUTOFF,
            1,
            REVOKED_BEFORE_KEY.format(user_id=user_id),
            math.ceil(time.time() * 1000),
            math.ceil(max(auth_settings.REFRESH_TOKEN_EXP, auth_settings.ACCESS_TOKEN_EXP).total_seconds()),
        )
        revoker = get_service_optional(ImpersonationRevoker)
        try:
            if revoker is not None:
                await revoker.revoke_user(user_id, self._redis)
        finally:
            closer = get_service_optional(UserSocketCloser)
            if closer is not None:
                await closer.close_user(user_id, self._redis)

    async def clear_user_cache(self, user_id: UUID) -> None:
        """Clear the user info cache."""
        key = f"auth:user:<{user_id}>"
        await self._redis.delete(key)
