from uuid import uuid4

import pytest
from plugin_auth.invite.config import invite_settings
from plugin_auth.password_reset.token_store import PasswordResetTokenStore


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.expiries: dict[str, object] = {}

    async def set(self, key: str, value: str, ex=None) -> None:
        self.store[key] = value
        self.expiries[key] = ex

    async def get(self, key: str):
        return self.store.get(key)

    async def getdel(self, key: str):
        return self.store.pop(key, None)

    async def delete(self, *keys: str) -> None:
        for key in keys:
            self.store.pop(key, None)

    async def exists(self, key: str) -> int:
        return int(key in self.store)

    async def eval(self, _script: str, _numkeys: int, email_key: str, ip_key: str) -> int:
        if email_key in self.store:
            return 0
        self.store[email_key] = "1"
        self.expiries[email_key] = 60
        ip_count = int(self.store.get(ip_key, "0")) + 1
        self.store[ip_key] = str(ip_count)
        if ip_count == 1:
            self.expiries[ip_key] = 3600
        return int(ip_count <= 10)


@pytest.mark.asyncio
async def test_reset_token_is_single_use_and_uses_invite_expiry() -> None:
    redis = FakeRedis()
    store = PasswordResetTokenStore(redis)
    user_id = uuid4()

    token = await store.issue(user_id)

    assert redis.expiries[f"auth:password-reset:token:<{token}>"] == invite_settings.INVITE_TOKEN_EXP
    assert await store.consume(token) == str(user_id)
    assert await store.consume(token) is None


@pytest.mark.asyncio
async def test_new_reset_token_revokes_old_without_touching_invite_token() -> None:
    redis = FakeRedis()
    store = PasswordResetTokenStore(redis)
    user_id = uuid4()
    redis.store["auth:invite:token:<invite>"] = str(user_id)

    old = await store.issue(user_id)
    new = await store.issue(user_id)

    assert await store.exists(old) is False
    assert await store.exists(new) is True
    assert redis.store["auth:invite:token:<invite>"] == str(user_id)


@pytest.mark.asyncio
async def test_email_rate_limit_normalizes_case_and_whitespace() -> None:
    store = PasswordResetTokenStore(FakeRedis())

    assert await store.allow_request("User@Example.com ", "192.0.2.1") is True
    assert await store.allow_request("user@example.com", "192.0.2.2") is False


@pytest.mark.asyncio
async def test_ip_rate_limit_allows_ten_requests_per_hour() -> None:
    store = PasswordResetTokenStore(FakeRedis())

    for index in range(10):
        assert await store.allow_request(f"user{index}@example.com", "198.51.100.2") is True
    assert await store.allow_request("blocked@example.com", "198.51.100.2") is False
