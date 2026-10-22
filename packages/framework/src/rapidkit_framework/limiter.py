"""Asynchronous Redis rate limits shared by every application replica."""

import math
import time
from typing import cast

from limits import parse
from limits.aio.storage import RedisStorage
from limits.aio.storage.redis.redispy import RedispyBridge
from limits.aio.strategies import FixedWindowRateLimiter

RateLimitRule = tuple[str, str, str]


class RateLimiterService:
    def __init__(self, redis_url: str) -> None:
        self._storage = RedisStorage(redis_url, implementation="redispy")
        self._strategy = FixedWindowRateLimiter(self._storage)

    async def check(self, rules: list[RateLimitRule]) -> int | None:
        retry_after = None
        for scope, key, limit in rules:
            item = parse(limit)
            if not await self._strategy.hit(item, scope, key):
                window = await self._strategy.get_window_stats(item, scope, key)
                delay = max(1, math.ceil(window.reset_time - time.time()))
                retry_after = max(retry_after or 0, delay)
        return retry_after

    async def close(self) -> None:
        await cast(RedispyBridge, self._storage.bridge).storage.aclose()
