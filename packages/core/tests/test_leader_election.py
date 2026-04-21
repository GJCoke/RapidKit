"""Tests for LeaderElection."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from rapidkit_core.leader_election import LeaderElection


@pytest.fixture
def mock_redis():
    """Mock Redis with a lock that can be configured to succeed or fail."""
    redis = AsyncMock()
    mock_lock = AsyncMock()
    mock_lock.acquire = AsyncMock(return_value=True)
    mock_lock.release = AsyncMock()
    mock_lock.owned = MagicMock(return_value=True)
    mock_lock.reacquire = AsyncMock()
    redis.lock = MagicMock(return_value=mock_lock)
    return redis, mock_lock


@pytest.mark.asyncio
async def test_acquires_leadership_on_start(mock_redis):
    """Leader election acquires leadership after start."""
    redis, mock_lock = mock_redis
    leader = LeaderElection(redis, "leader:test", ttl=15, renew_interval=0.05)
    await leader.start()
    await asyncio.sleep(0.1)
    assert leader.is_leader is True
    await leader.stop()


@pytest.mark.asyncio
async def test_not_leader_when_lock_fails(mock_redis):
    """Instance is not leader when lock acquisition fails."""
    redis, mock_lock = mock_redis
    mock_lock.acquire = AsyncMock(return_value=False)
    leader = LeaderElection(redis, "leader:test", ttl=15, renew_interval=0.05)
    await leader.start()
    await asyncio.sleep(0.1)
    assert leader.is_leader is False
    await leader.stop()


@pytest.mark.asyncio
async def test_loses_leadership_on_reacquire_failure(mock_redis):
    """Leader loses leadership when reacquire raises."""
    redis, mock_lock = mock_redis
    leader = LeaderElection(redis, "leader:test", ttl=15, renew_interval=0.05)
    await leader.start()
    await asyncio.sleep(0.1)
    assert leader.is_leader is True

    # Simulate renewal failure
    mock_lock.reacquire = AsyncMock(side_effect=Exception("connection lost"))
    await asyncio.sleep(0.15)
    assert leader.is_leader is False
    await leader.stop()


@pytest.mark.asyncio
async def test_stop_releases_lock(mock_redis):
    """Stopping a leader releases the underlying lock."""
    redis, mock_lock = mock_redis
    leader = LeaderElection(redis, "leader:test", ttl=15, renew_interval=0.05)
    await leader.start()
    await asyncio.sleep(0.1)
    await leader.stop()
    mock_lock.release.assert_awaited()


@pytest.mark.asyncio
async def test_stop_when_not_leader(mock_redis):
    """Stopping a non-leader does not attempt release."""
    redis, mock_lock = mock_redis
    mock_lock.acquire = AsyncMock(return_value=False)
    leader = LeaderElection(redis, "leader:test", ttl=15, renew_interval=0.05)
    await leader.start()
    await asyncio.sleep(0.1)
    await leader.stop()
    mock_lock.release.assert_not_awaited()


@pytest.mark.asyncio
async def test_start_is_idempotent(mock_redis):
    """Calling start() twice does not create duplicate tasks."""
    redis, mock_lock = mock_redis
    leader = LeaderElection(redis, "leader:test", ttl=15, renew_interval=0.05)
    await leader.start()
    await leader.start()  # second call should be no-op
    await asyncio.sleep(0.1)
    await leader.stop()
