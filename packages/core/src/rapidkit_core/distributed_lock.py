"""
Redis-based distributed lock.

Thin wrapper around ``redis.asyncio.lock.Lock`` providing a project-standard
interface with non-blocking ``acquire()`` and a context-manager that raises
``LockNotAcquired`` on failure.

Author : Coke
Date   : 2026-04-21
"""

from redis.asyncio import Redis
from redis.asyncio.lock import Lock


class DistributedLock:
    """
    Non-blocking distributed lock backed by Redis.

    Usage::

        lock = DistributedLock(redis, "lock:my_resource", ttl=30)

        # Option A — manual acquire / release
        if await lock.acquire():
            try:
                ...
            finally:
                await lock.release()

        # Option B — context manager (raises LockNotAcquired on failure)
        async with lock:
            ...
    """

    def __init__(self, redis: Redis, key: str, *, ttl: int = 30) -> None:
        self._lock: Lock = redis.lock(key, timeout=ttl, blocking=False)

    async def acquire(self) -> bool:
        """Try to acquire the lock. Returns True on success, False otherwise."""
        return bool(await self._lock.acquire())

    async def release(self) -> None:
        """Release the lock. Safe to call only if currently held."""
        await self._lock.release()

    async def __aenter__(self) -> "DistributedLock":
        if not await self.acquire():
            raise LockNotAcquired(str(self._lock.name))
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:  # noqa: ANN001
        await self.release()


class LockNotAcquired(Exception):
    """Raised when a distributed lock cannot be acquired."""

    def __init__(self, key: str) -> None:
        super().__init__(f"Failed to acquire lock: {key}")
        self.key = key
