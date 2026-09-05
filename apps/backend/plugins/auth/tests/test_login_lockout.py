"""Tests for temporary login lockout feedback."""

import pytest
from plugin_auth.auth.services import user_login
from plugin_auth.auth_config import auth_settings
from plugin_auth.status_codes import AuthStatusCode
from rapidkit_framework.exceptions import AppException


class LockedRedis:
    def __init__(self, ttl: int) -> None:
        self.ttl_value = ttl
        self.ttl_key: str | None = None

    async def get(self, key: str) -> str:
        return str(auth_settings.LOGIN_MAX_ATTEMPTS)

    async def ttl(self, key: str) -> int:
        self.ttl_key = key
        return self.ttl_value


class BrokenTTLRedis(LockedRedis):
    async def ttl(self, key: str) -> int:
        raise ConnectionError


@pytest.mark.parametrize(("ttl", "expected"), [(287, 287), (0, 1), (-1, 1), (-2, 1)])
@pytest.mark.asyncio
async def test_locked_login_returns_retry_after_seconds(ttl: int, expected: int) -> None:
    redis = LockedRedis(ttl)

    with pytest.raises(AppException) as caught:
        await user_login(
            "person",
            "encrypted",
            user_crud=None,
            token_store=None,
            redis=redis,
            user_agent="test",
        )

    assert caught.value.code == AuthStatusCode.ACCOUNT_LOCKED.code
    assert caught.value.data == {"retryAfterSeconds": expected}
    assert redis.ttl_key == "auth:login_attempts:<person>"


@pytest.mark.asyncio
async def test_locked_login_falls_back_when_ttl_lookup_fails() -> None:
    with pytest.raises(AppException) as caught:
        await user_login(
            "person",
            "encrypted",
            user_crud=None,
            token_store=None,
            redis=BrokenTTLRedis(0),
            user_agent="test",
        )

    assert caught.value.data == {"retryAfterSeconds": 1}
