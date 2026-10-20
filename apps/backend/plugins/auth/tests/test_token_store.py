"""Tests for TokenStore — auth token lifecycle management."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_auth.auth.services import refresh_user_token
from plugin_auth.auth.token_store import TokenStore
from rapidkit_common.protocols.auth import UserSocketCloser
from rapidkit_common.protocols.impersonation import ImpersonationRevoker
from rapidkit_framework.exceptions import AppException
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
    assert await redis.get(f"auth:force_relogin:<{user_id}>") == "1"
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
    assert await redis.get(f"auth:force_relogin:<{user_id}>") == "1"
