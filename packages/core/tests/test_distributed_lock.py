"""Tests for DistributedLock."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from rapidkit_core.distributed_lock import DistributedLock, LockNotAcquired


@pytest.fixture
def mock_redis():
    """Create a mock Redis client with a mock lock."""
    redis = AsyncMock()
    mock_lock = AsyncMock()
    mock_lock.acquire = AsyncMock(return_value=True)
    mock_lock.release = AsyncMock()
    redis.lock = MagicMock(return_value=mock_lock)
    return redis, mock_lock


@pytest.mark.asyncio
async def test_acquire_success(mock_redis):
    """acquire() returns True when redis lock is obtained."""

    redis, mock_lock = mock_redis
    lock = DistributedLock(redis, "lock:test", ttl=10)
    result = await lock.acquire()
    assert result is True
    mock_lock.acquire.assert_awaited_once()


@pytest.mark.asyncio
async def test_acquire_failure(mock_redis):
    """acquire() returns False when redis lock is not available."""

    redis, mock_lock = mock_redis
    mock_lock.acquire = AsyncMock(return_value=False)
    lock = DistributedLock(redis, "lock:test", ttl=10)
    result = await lock.acquire()
    assert result is False


@pytest.mark.asyncio
async def test_release(mock_redis):
    """release() delegates to the underlying redis lock."""

    redis, mock_lock = mock_redis
    lock = DistributedLock(redis, "lock:test", ttl=10)
    await lock.acquire()
    await lock.release()
    mock_lock.release.assert_awaited_once()


@pytest.mark.asyncio
async def test_context_manager_success(mock_redis):
    """Context manager acquires and releases lock."""

    redis, mock_lock = mock_redis
    async with DistributedLock(redis, "lock:test", ttl=10):
        mock_lock.acquire.assert_awaited_once()
    mock_lock.release.assert_awaited_once()


@pytest.mark.asyncio
async def test_context_manager_raises_on_failure(mock_redis):
    """Context manager raises LockNotAcquired when lock unavailable."""

    redis, mock_lock = mock_redis
    mock_lock.acquire = AsyncMock(return_value=False)
    with pytest.raises(LockNotAcquired):
        async with DistributedLock(redis, "lock:test", ttl=10):
            pass


@pytest.mark.asyncio
async def test_lock_created_with_correct_params():
    """redis.lock() is called with correct key, timeout, blocking=False."""

    redis = AsyncMock()
    mock_lock = AsyncMock()
    mock_lock.acquire = AsyncMock(return_value=True)
    redis.lock = MagicMock(return_value=mock_lock)

    lock = DistributedLock(redis, "lock:mykey", ttl=42)
    await lock.acquire()

    redis.lock.assert_called_once_with("lock:mykey", timeout=42, blocking=False)
