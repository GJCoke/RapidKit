"""Tests for DistributedLock."""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio
from rapidkit_core.distributed_lock import DistributedLock, LockNotAcquired
from redis.asyncio import Redis
from redis.exceptions import ConnectionError, LockNotOwnedError


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


@pytest.fixture
def unique_lock_key():
    return f"test:lock-renew:{uuid4()}"


@pytest_asyncio.fixture
async def real_redis(unique_lock_key):
    client = Redis.from_url(os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15"))
    await client.ping()
    try:
        yield client
    finally:
        await client.delete(unique_lock_key)
        await client.aclose()


@pytest.mark.parametrize("ttl", [0, -1])
def test_ttl_must_be_positive(mock_redis, ttl):
    with pytest.raises(ValueError, match="ttl"):
        DistributedLock(mock_redis[0], "test:invalid", ttl=ttl)


@pytest.mark.asyncio
async def test_auto_renew_prevents_second_holder_after_original_ttl(real_redis, unique_lock_key):
    before = asyncio.all_tasks()
    first = DistributedLock(real_redis, unique_lock_key, ttl=1, auto_renew=True)
    second = DistributedLock(real_redis, unique_lock_key, ttl=1)
    assert await first.acquire()
    try:
        await asyncio.sleep(2.2)
        assert not await second.acquire()
    finally:
        await first.release()
    assert asyncio.all_tasks() <= before
    assert await second.acquire()
    await second.release()


@pytest.mark.asyncio
async def test_default_does_not_renew(real_redis, unique_lock_key):
    first = DistributedLock(real_redis, unique_lock_key, ttl=1)
    second = DistributedLock(real_redis, unique_lock_key, ttl=1)
    assert await first.acquire()
    await asyncio.sleep(1.1)
    assert await second.acquire()
    with pytest.raises(LockNotOwnedError):
        await first.release()
    await second.release()


@pytest.mark.asyncio
async def test_cancellation_releases_and_stops_renewal(real_redis, unique_lock_key):
    entered = asyncio.Event()
    before = asyncio.all_tasks()

    async def work():
        async with DistributedLock(real_redis, unique_lock_key, ttl=1, auto_renew=True):
            entered.set()
            await asyncio.Event().wait()

    owner = asyncio.create_task(work())
    await asyncio.wait_for(entered.wait(), 2)
    owner.cancel()
    with pytest.raises(asyncio.CancelledError):
        await owner
    assert asyncio.all_tasks() <= before
    assert not await real_redis.exists(unique_lock_key)


@pytest.mark.asyncio
async def test_lost_lock_never_extends_or_deletes_new_owner(real_redis, unique_lock_key):
    entered = asyncio.Event()

    async def work():
        lock = DistributedLock(real_redis, unique_lock_key, ttl=1, auto_renew=True)
        assert await lock.acquire()
        try:
            entered.set()
            await asyncio.Event().wait()
        finally:
            await lock.release()

    owner = asyncio.create_task(work())
    await asyncio.wait_for(entered.wait(), 2)
    await real_redis.set(unique_lock_key, b"new-owner", px=5000)
    try:
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(owner, 2)
        assert owner.cancelled()
        assert await real_redis.get(unique_lock_key) == b"new-owner"
        assert await real_redis.pttl(unique_lock_key) > 4000
    finally:
        owner.cancel()


@pytest.mark.asyncio
async def test_renewal_failure_cancels_owner_and_preserves_cancellation(mock_redis):
    redis, underlying = mock_redis
    underlying.reacquire.side_effect = ConnectionError("redis unavailable")
    underlying.release.side_effect = ConnectionError("redis unavailable")

    async def work():
        lock = DistributedLock(redis, "test:outage", ttl=1, auto_renew=True)
        assert await lock.acquire()
        try:
            await asyncio.Event().wait()
        finally:
            await lock.release()

    owner = asyncio.create_task(work())
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(owner, 2)
    assert owner.cancelled()


@pytest.mark.asyncio
async def test_release_error_cannot_replace_business_exception(mock_redis):
    redis, underlying = mock_redis
    underlying.release.side_effect = RuntimeError("release failed")
    with pytest.raises(ValueError, match="business failure"):
        async with DistributedLock(redis, "test:release", auto_renew=True):
            raise ValueError("business failure")


@pytest.mark.asyncio
@pytest.mark.parametrize("blocked", ["renewal", "release"])
async def test_unresponsive_redis_does_not_leave_owner_running(mock_redis, blocked):
    redis, underlying = mock_redis

    async def never_returns():
        await asyncio.Event().wait()

    if blocked == "renewal":
        underlying.reacquire.side_effect = never_returns
    else:
        underlying.reacquire.side_effect = ConnectionError("offline")
        underlying.release.side_effect = never_returns

    async def work():
        lock = DistributedLock(redis, "test:unresponsive", ttl=1, auto_renew=True)
        assert await lock.acquire()
        try:
            await asyncio.Event().wait()
        finally:
            await lock.release()

    owner = asyncio.create_task(work())
    try:
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(asyncio.shield(owner), 1.2)
    finally:
        owner.cancel()
        await asyncio.sleep(0)
        owner.cancel()
        await asyncio.gather(owner, return_exceptions=True)
