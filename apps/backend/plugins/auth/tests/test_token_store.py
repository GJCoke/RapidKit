"""Tests for TokenStore — auth token lifecycle management."""

import asyncio
import time
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_auth.auth.deps import get_current_user_form_redis_and_db
from plugin_auth.auth.services import refresh_user_token
from plugin_auth.auth.token_store import TokenStore
from plugin_auth.auth_config import auth_settings
from plugin_auth.providers import SessionInvalidatorImpl
from plugin_auth.status_codes import AuthStatusCode
from rapidkit_common.protocols.auth import UserSocketCloser
from rapidkit_common.protocols.impersonation import ImpersonationRevoker
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from rapidkit_security import RefreshJWT, decode_token
from src.sio.sessions import RedisSocketCloser, socket_member


@pytest.fixture
def redis_mock():
    redis = AsyncMock()
    redis.get.return_value = None
    redis.exists.return_value = False
    redis.set.return_value = True
    redis.delete.return_value = 1
    redis.incr.return_value = 1
    redis.keys.return_value = []
    return redis


@pytest.fixture
def token_store(redis_mock, monkeypatch):
    monkeypatch.setattr("plugin_auth.auth.token_store.get_service_optional", lambda protocol: None)
    return TokenStore(redis_mock)


@pytest.mark.asyncio
async def test_issue_returns_token_pair(token_store, redis_mock):
    result = await token_store.issue(uuid4(), "testuser", "Mozilla/5.0")
    assert result.access_token
    assert result.refresh_token
    redis_mock.set.assert_called_once()


@pytest.mark.asyncio
async def test_revoke_deletes_refresh_key(token_store, redis_mock):
    user_id = uuid4()
    jti = uuid4()
    redis_mock.exists.return_value = True
    await token_store.revoke(user_id, jti)
    redis_mock.delete.assert_called()


@pytest.mark.asyncio
async def test_is_valid_returns_true_when_key_exists(token_store, redis_mock):
    redis_mock.exists.return_value = True
    assert await token_store.is_valid(uuid4(), uuid4()) is True


@pytest.mark.asyncio
async def test_is_valid_returns_false_when_key_missing(token_store, redis_mock):
    redis_mock.exists.return_value = False
    assert await token_store.is_valid(uuid4(), uuid4()) is False


@pytest.mark.asyncio
async def test_is_replay_true_when_used_key_exists(token_store, redis_mock):
    redis_mock.exists.return_value = True
    assert await token_store.is_replay(uuid4(), uuid4()) is True


@pytest.mark.asyncio
async def test_rotate_deletes_old_and_issues_new(token_store, redis_mock):
    redis_mock.exists.return_value = True
    user_id = uuid4()
    jti = uuid4()
    result = await token_store.rotate(user_id, "testuser", jti, "Mozilla/5.0")
    assert result.access_token
    assert result.refresh_token
    redis_mock.delete.assert_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["force_relogin", "revoke_all", "refresh_replay"])
async def test_force_relogin_entries_close_registered_sockets(redis, monkeypatch, entry):
    user_id, jti = uuid4(), uuid4()
    key = f"sio:user:<{user_id}>:sockets"
    await redis.sadd(key, socket_member("/notifications", "notification-sid"), socket_member("/worker", "worker-sid"))
    await redis.set(f"auth:refresh:<{user_id}>:<{uuid4()}>", "refresh")
    external, revoker = AsyncMock(), AsyncMock()
    closer = RedisSocketCloser(external)
    monkeypatch.setattr(
        "plugin_auth.auth.token_store.get_service_optional",
        lambda protocol: {UserSocketCloser: closer, ImpersonationRevoker: revoker}.get(protocol),
    )
    store = TokenStore(redis)
    if entry == "refresh_replay":
        await redis.set(f"auth:used_refresh:<{user_id}>:<{jti}>", "1")
        with pytest.raises(AppException):
            await refresh_user_token(jti, SimpleNamespace(id=user_id), store, redis, "test-agent")
    else:
        await getattr(store, entry)(user_id)

    assert not await redis.exists(key)
    assert int(await redis.get(f"auth:revoked_before:{user_id}")) > 0
    assert {call.kwargs["namespace"] for call in external.disconnect.await_args_list} == {"/notifications", "/worker"}
    assert len(external.emit.await_args_list) == 2
    assert all(call.args == ("auth:revoked", {"code": "unauthorized"}) for call in external.emit.await_args_list)
    revoker.revoke_user.assert_awaited_once_with(user_id, redis)


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["force_relogin", "revoke_all"])
async def test_force_relogin_without_optional_services(redis, monkeypatch, entry):
    monkeypatch.setattr("plugin_auth.auth.token_store.get_service_optional", lambda protocol: None)
    user_id = uuid4()
    await getattr(TokenStore(redis), entry)(user_id)
    assert int(await redis.get(f"auth:revoked_before:{user_id}")) > 0


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["force_relogin", "revoke_all", "invalidator"])
async def test_force_relogin_still_closes_sockets_if_impersonation_revocation_fails(redis, monkeypatch, entry):
    user_id = uuid4()
    key = f"sio:user:<{user_id}>:sockets"
    await redis.sadd(key, socket_member("/notifications", "sid"))
    external, revoker = AsyncMock(), AsyncMock()
    revoker.revoke_user.side_effect = RuntimeError("revocation offline")
    closer = RedisSocketCloser(external)
    for module in ("plugin_auth.auth.token_store",):
        monkeypatch.setattr(
            module + ".get_service_optional",
            lambda protocol: {UserSocketCloser: closer, ImpersonationRevoker: revoker}.get(protocol),
        )
    with pytest.raises(RuntimeError, match="revocation offline"):
        if entry == "invalidator":
            await SessionInvalidatorImpl().invalidate_user_sessions(user_id, redis)
        else:
            await getattr(TokenStore(redis), entry)(user_id)
    assert not await redis.exists(key)
    external.disconnect.assert_awaited_once_with("sid", namespace="/notifications")
    external.emit.assert_awaited_once_with(
        "auth:revoked", {"code": "unauthorized"}, to="sid", namespace="/notifications"
    )


@pytest.fixture
def real_store(redis, monkeypatch):
    monkeypatch.setattr("plugin_auth.auth.token_store.get_service_optional", lambda protocol: None)
    return TokenStore(AsyncRedisClient(connection_pool=redis.connection_pool))


@pytest.mark.parametrize(
    "iat, expected", [(1760000000.100, True), (1760000000.500, False), (1760000000.900, False), (None, True)]
)
async def test_legacy_iat_and_same_second_cutoff(real_store, redis, iat, expected):
    user_id, jti = uuid4(), uuid4()
    assert await real_store.is_revoked(user_id, jti, iat) is False
    await redis.set(f"auth:revoked_before:{user_id}", 1760000000500, ex=604800)
    assert await real_store.is_revoked(user_id, jti, iat) is expected


async def test_revoke_reads_are_one_round_trip(redis_mock):
    redis_mock.mget.return_value = [None, None, None]
    store = TokenStore(redis_mock)
    assert await store.is_revoked(uuid4(), uuid4(), 1760000000.100) is False
    assert redis_mock.mget.await_count == 1
    redis_mock.get.assert_not_awaited()
    redis_mock.exists.assert_not_awaited()


async def test_access_blacklist_expires_at_token_deadline(real_store, redis):
    user_id, jti, other_jti, expired_jti = uuid4(), uuid4(), uuid4(), uuid4()
    now = time.time()
    await real_store.revoke_access(jti, now + 900)
    assert await real_store.is_revoked(user_id, jti, now) is True
    assert await real_store.is_revoked(user_id, other_jti, now) is False
    assert 899 <= await redis.ttl(f"auth:access_revoked:{jti}") <= 900
    await real_store.revoke_access(expired_jti, now - 1)
    assert not await redis.exists(f"auth:access_revoked:{expired_jti}")


async def test_revoke_all_uses_scan_and_preserves_other_users(real_store, redis, monkeypatch):
    user_id, other_id = uuid4(), uuid4()
    keys = [f"auth:refresh:<{user_id}>:<{uuid4()}>" for _ in range(103)]
    await redis.mset(dict.fromkeys(keys, "refresh"))
    other = f"auth:refresh:<{other_id}>:<{uuid4()}>"
    await redis.set(other, "refresh")

    async def forbidden_keys(*args, **kwargs):
        raise AssertionError("KEYS blocks Redis")

    monkeypatch.setattr(real_store._redis, "keys", forbidden_keys)
    await real_store.revoke_all(user_id)
    assert not any(await redis.mget(keys))
    assert await redis.get(other) == "refresh"
    assert int(await redis.get(f"auth:revoked_before:{user_id}")) > 0


async def test_cutoff_never_moves_backwards_and_uses_refresh_ttl(real_store, redis, monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCESS_TOKEN_EXP", timedelta(seconds=20))
    user_id = uuid4()
    monkeypatch.setattr(auth_settings, "REFRESH_TOKEN_EXP", timedelta(seconds=42))
    monkeypatch.setattr(time, "time", lambda: 1760000000.900)
    await real_store.force_relogin(user_id)
    monkeypatch.setattr(time, "time", lambda: 1760000000.100)
    await real_store.force_relogin(user_id)
    assert int(await redis.get(f"auth:revoked_before:{user_id}")) == 1760000000900
    assert 41 <= await redis.ttl(f"auth:revoked_before:{user_id}") <= 42


@pytest.mark.asyncio
async def test_cutoff_outlives_longer_access_tokens(real_store, monkeypatch):
    monkeypatch.setattr(auth_settings, "REFRESH_TOKEN_EXP", timedelta(milliseconds=250))
    monkeypatch.setattr(auth_settings, "ACCESS_TOKEN_EXP", timedelta(seconds=3))
    user_id, jti = uuid4(), uuid4()
    issued = time.time() - 0.1
    await real_store.force_relogin(user_id)
    await asyncio.sleep(1.1)
    assert await real_store.is_revoked(user_id, jti, issued)


@pytest.mark.asyncio
async def test_legacy_marker_blocks_old_token_without_blocking_new_login(real_store, redis):
    user_id, jti = uuid4(), uuid4()
    key = f"auth:force_relogin:<{user_id}>"
    await redis.set(key, "1", ex=60)
    assert await real_store.is_revoked(user_id, jti, None)
    pair = await real_store.issue(user_id, "User", "agent")
    claims = decode_token(pair.access_token, auth_settings.ACCESS_TOKEN_KEY)
    assert not await real_store.is_revoked(user_id, claims.jti, claims.iat)
    assert await redis.exists(key)


@pytest.mark.asyncio
async def test_legacy_revocation_blocks_cached_refresh(redis):
    claims = RefreshJWT(sub=uuid4(), jti=uuid4(), name="User", agent="agent")
    await redis.set(f"auth:force_relogin:<{claims.sub}>", "1", ex=60)
    await redis.set(f"auth:refresh:<{claims.sub}>:<{claims.jti}>", "old-refresh")
    with pytest.raises(AppException) as error:
        await get_current_user_form_redis_and_db(claims, AsyncMock(), redis)
    assert error.value.code == int(AuthStatusCode.TOKEN_INVALID)


async def test_issue_waits_past_revocation_boundary(real_store, redis):
    from rapidkit_security import decode_token

    user_id = uuid4()
    await real_store.force_relogin(user_id)
    cutoff = int(await redis.get(f"auth:revoked_before:{user_id}"))
    pair = await real_store.issue(user_id, "test", "test-agent")
    for token, key in (
        (pair.access_token, auth_settings.ACCESS_TOKEN_KEY),
        (pair.refresh_token, auth_settings.REFRESH_TOKEN_KEY),
    ):
        claims = decode_token(token, key)
        assert claims.iat * 1000 > cutoff


async def test_revoke_all_preserves_new_login_during_scan(real_store, monkeypatch):
    from rapidkit_security import decode_token

    user_id = uuid4()
    old = await real_store.issue(user_id, "test", "test-agent")
    old_claims = decode_token(old.refresh_token, auth_settings.REFRESH_TOKEN_KEY)
    scan = real_store._redis.scan_iter
    issued = []

    async def scan_after_login(**kwargs):
        issued.append(await real_store.issue(user_id, "test", "test-agent"))
        async for key in scan(**kwargs):
            yield key

    monkeypatch.setattr(real_store._redis, "scan_iter", scan_after_login)
    await real_store.revoke_all(user_id)
    assert len(issued) == 1
    new_claims = decode_token(issued[0].refresh_token, auth_settings.REFRESH_TOKEN_KEY)
    assert await real_store.is_valid(user_id, old_claims.jti) is False
    assert await real_store.is_valid(user_id, new_claims.jti) is True
