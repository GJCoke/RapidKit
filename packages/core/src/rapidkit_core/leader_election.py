"""
Redis-based leader election using TTL key.

Only one instance holds the leader lock at any time. The leader
periodically renews; other instances retry on each interval.
Built on ``redis.asyncio.lock.Lock`` with ``blocking=False``.

Author : Coke
Date   : 2026-04-21
"""

import asyncio

from redis.asyncio import Redis
from redis.asyncio.lock import Lock

from rapidkit_core.log import logger


class LeaderElection:
    """
    Simple leader election based on redis-py Lock.

    Usage::

        leader = LeaderElection(redis, "leader:push_loop")
        await leader.start()

        while True:
            if not leader.is_leader:
                await asyncio.sleep(interval)
                continue
            # leader-only work ...

        await leader.stop()
    """

    def __init__(
        self,
        redis: Redis,
        key: str,
        *,
        ttl: int = 15,
        renew_interval: float = 5.0,
    ) -> None:
        if ttl <= 0 or not 0 < renew_interval < ttl:
            raise ValueError("ttl must be positive and renewal must happen before lease expiry")
        self._lock: Lock = redis.lock(key, timeout=ttl, blocking=False)
        self._ttl = ttl
        self._renew_interval = renew_interval
        self._operation_timeout = min(ttl / 3, (ttl - renew_interval) / 2)
        self._is_leader = False
        self._task: asyncio.Task | None = None
        self._key = key

    @property
    def is_leader(self) -> bool:
        """Whether this instance currently holds the leader key."""
        return self._is_leader

    async def start(self) -> None:
        """Start the election loop in the background."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._election_loop())

    async def stop(self) -> None:
        """Stop the election loop and release leadership if held."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._is_leader:
            try:
                async with asyncio.timeout(self._operation_timeout):
                    await self._lock.release()
            except Exception:
                logger.debug("Failed to release leader key '{}'", self._key, exc_info=True)
            self._is_leader = False

    async def _election_loop(self) -> None:
        """Periodically try to acquire or renew leadership."""
        while True:
            try:
                async with asyncio.timeout(self._operation_timeout):
                    if self._is_leader:
                        # Renew only while the ownership token still matches.
                        await self._lock.reacquire()
                    else:
                        acquired = await self._lock.acquire()
                        if acquired:
                            self._is_leader = True
                            logger.info("Acquired leadership for '{}'", self._key)
            except asyncio.CancelledError:
                raise
            except Exception:
                if self._is_leader:
                    logger.warning("Lost leadership for '{}'", self._key)
                    self._is_leader = False
                else:
                    logger.debug(
                        "Leader election attempt failed for '{}', will retry",
                        self._key,
                        exc_info=True,
                    )

            await asyncio.sleep(self._renew_interval)
