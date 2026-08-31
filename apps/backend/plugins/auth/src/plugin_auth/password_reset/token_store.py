"""Single-use password-reset tokens and request throttling in Redis."""

import hashlib
import secrets
from uuid import UUID

from rapidkit_core.redis_client import AsyncRedisClient

from plugin_auth.invite.config import invite_settings

_TOKEN_KEY = "auth:password-reset:token:<{token}>"
_USER_KEY = "auth:password-reset:user:<{user_id}>"
_EMAIL_RATE_KEY = "auth:password-reset:rate:email:<{digest}>"
_IP_RATE_KEY = "auth:password-reset:rate:ip:<{ip}>"

_ALLOW_REQUEST_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
end
redis.call('SET', KEYS[1], '1', 'EX', 60)
local count = redis.call('INCR', KEYS[2])
if count == 1 then
    redis.call('EXPIRE', KEYS[2], 3600)
end
if count > 10 then
    return 0
end
return 1
"""


class PasswordResetTokenStore:
    """Manage reset tokens and atomic email/IP request limits."""

    def __init__(self, redis: AsyncRedisClient) -> None:
        self._redis = redis

    async def issue(self, user_id: UUID) -> str:
        await self.revoke_for_user(user_id)
        token = secrets.token_urlsafe(32)
        expiry = invite_settings.INVITE_TOKEN_EXP
        await self._redis.set(_TOKEN_KEY.format(token=token), str(user_id), ex=expiry)
        await self._redis.set(_USER_KEY.format(user_id=user_id), token, ex=expiry)
        return token

    async def consume(self, token: str) -> str | None:
        user_id = await self._redis.getdel(_TOKEN_KEY.format(token=token))
        if not user_id:
            return None
        if isinstance(user_id, bytes):
            user_id = user_id.decode()
        await self._redis.delete(_USER_KEY.format(user_id=user_id))
        return user_id

    async def exists(self, token: str) -> bool:
        return bool(await self._redis.exists(_TOKEN_KEY.format(token=token)))

    async def revoke_for_user(self, user_id: UUID) -> None:
        user_key = _USER_KEY.format(user_id=user_id)
        old_token = await self._redis.get(user_key)
        if isinstance(old_token, bytes):
            old_token = old_token.decode()
        if old_token:
            await self._redis.delete(_TOKEN_KEY.format(token=old_token), user_key)

    async def allow_request(self, email: str, ip: str) -> bool:
        normalized = email.strip().casefold()
        digest = hashlib.sha256(normalized.encode()).hexdigest()
        allowed = await self._redis.eval(
            _ALLOW_REQUEST_SCRIPT,
            2,
            _EMAIL_RATE_KEY.format(digest=digest),
            _IP_RATE_KEY.format(ip=ip),
        )
        return bool(allowed)
