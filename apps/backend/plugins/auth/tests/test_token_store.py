"""Tests for TokenStore — auth token lifecycle management."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_auth.auth.token_store import TokenStore


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
def token_store(redis_mock):
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
