"""
Redis-based distributed lock.

Thin wrapper around ``redis.asyncio.lock.Lock`` providing a project-standard
interface with non-blocking ``acquire()`` and a context-manager that raises
``LockNotAcquired`` on failure.

Author : Coke
Date   : 2026-04-21
"""

import asyncio
import sys
from types import TracebackType

from redis.asyncio import Redis
from redis.asyncio.lock import Lock

from rapidkit_core.log import logger


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

    def __init__(self, redis: Redis, key: str, *, ttl: int = 30, auto_renew: bool = False) -> None:
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self._lock: Lock = redis.lock(key, timeout=ttl, blocking=False)
        self._ttl = ttl
        self._auto_renew = auto_renew
        self._renew_task: asyncio.Task | None = None
        self._owner: asyncio.Task | None = None
        self._lost = False

    async def _renew(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._ttl / 3)
                await self._lock.reacquire()
        except asyncio.CancelledError:
            raise
        except Exception:
            self._lost = True
            logger.warning("Lost distributed lock '{}'; cancelling its task", self._lock.name)
            if self._owner is not None and not self._owner.done():
                self._owner.cancel()

    async def acquire(self) -> bool:
        """Try to acquire the lock. Returns True on success, False otherwise."""
        acquired = bool(await self._lock.acquire())
        if acquired and self._auto_renew:
            self._lost = False
            self._owner = asyncio.current_task()
            self._renew_task = asyncio.create_task(self._renew())
        return acquired

    async def release(self) -> None:
        """Release the lock. Safe to call only if currently held."""
        active_exception = sys.exception()
        if self._renew_task is not None:
            self._renew_task.cancel()
            try:
                await self._renew_task
            except asyncio.CancelledError:
                pass
            self._renew_task = None
        self._owner = None
        try:
            await self._lock.release()
        except Exception:
            if not self._auto_renew or (not self._lost and active_exception is None):
                raise
            # Manual acquire/finally-release jobs must retain their original cancellation/error.
            logger.warning("Could not release distributed lock '{}' during task cleanup", self._lock.name)

    async def __aenter__(self) -> "DistributedLock":
        if not await self.acquire():
            raise LockNotAcquired(str(self._lock.name))
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        await self.release()


class LockNotAcquired(Exception):
    """Raised when a distributed lock cannot be acquired."""

    def __init__(self, key: str) -> None:
        super().__init__(f"Failed to acquire lock: {key}")
        self.key = key
