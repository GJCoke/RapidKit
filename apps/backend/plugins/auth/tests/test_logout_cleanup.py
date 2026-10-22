"""Logout cleans user caches without revoking other sessions or users."""

import time
from uuid import uuid4

import pytest
from plugin_auth.auth.api import logout
from plugin_auth.auth.token_store import TokenStore
from plugin_permission.providers import PermissionCacheManagerImpl
from rapidkit_security import AccessJWT


class RedisState:
    def __init__(self, values, failing_key=None):
        self.values = dict(values)
        self.failing_key = failing_key

    async def set(self, key, value, **kwargs):
        self.values[key] = value

    async def delete(self, *keys):
        if self.failing_key in keys:
            raise RuntimeError("Redis deletion failed")
        for key in keys:
            self.values.pop(key, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [None, "refresh", "user", "permission"])
async def test_logout_attempts_all_cleanup_and_preserves_other_sessions(monkeypatch, failure):
    user_id, jti, other_jti, other_user = uuid4(), uuid4(), uuid4(), uuid4()
    keys = {
        "refresh": f"auth:refresh:<{user_id}>:<{jti}>",
        "user": f"auth:user:<{user_id}>",
        "permission": f"auth:permission:<{user_id}>",
    }
    other = {
        f"auth:refresh:<{user_id}>:<{other_jti}>": "other-session",
        f"auth:user:<{other_user}>": "other-user",
        "cache:menu:version": "shared",
    }
    redis = RedisState({**dict.fromkeys(keys.values(), "cached"), **other}, keys.get(failure))
    monkeypatch.setattr("plugin_auth.auth.api.get_service", lambda _: PermissionCacheManagerImpl())
    auth = AccessJWT(sub=user_id, jti=jti, name="User", exp=time.time() + 900)
    if failure:
        with pytest.raises(RuntimeError, match="Redis deletion failed"):
            await logout(auth, TokenStore(redis), redis)
    else:
        assert (await logout(auth, TokenStore(redis), redis)).data is True
    assert redis.values == {
        **other,
        f"auth:access_revoked:{jti}": "1",
        **({keys[failure]: "cached"} if failure else {}),
    }
