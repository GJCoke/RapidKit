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
