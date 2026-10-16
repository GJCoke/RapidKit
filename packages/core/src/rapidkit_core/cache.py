"""
插件级缓存管理器 — 带命名空间隔离的 Redis 缓存封装。

Author : Coke
Date   : 2026-04-14
"""

import asyncio
import random
import time
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import TYPE_CHECKING

from redis.exceptions import LockError

from rapidkit_core.distributed_lock import DistributedLock
from rapidkit_core.log import logger

if TYPE_CHECKING:
    from rapidkit_core.redis_client import AsyncRedisClient


class PluginCacheManager:
    """
    插件级缓存管理器。

    为每个插件提供独立的 Redis 键命名空间，避免跨插件缓存冲突。
    键格式：``plugin:{plugin_name}:{key}``
    """

    def __init__(self, plugin_name: str) -> None:
        self._plugin_name = plugin_name
        self._prefix = f"plugin:{plugin_name}:"

    @property
    def prefix(self) -> str:
        """返回当前插件的缓存键前缀。"""
        return self._prefix

    def make_key(self, *parts: str) -> str:
        """
        生成带命名空间前缀的缓存键。

        Args:
            *parts: 键的各个部分。

        Returns:
            完整的缓存键字符串。
        """
        return self._prefix + ":".join(parts)

    async def invalidate_all(self, redis_client: "AsyncRedisClient") -> int:
        """
        清除本插件的所有缓存键。

        Args:
            redis_client: AsyncRedisClient 实例。

        Returns:
            删除的键数量。
        """
        pattern = f"{self._prefix}*"
        deleted = 0
        cursor = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
            if keys:
                deleted += await redis_client.delete(*keys)
            if cursor == 0:
                break
        return deleted


def _seed_version() -> int:
    """以当前毫秒时间戳作为版本初值，保证重新初始化的版本大于任何历史版本。"""
    return time.time_ns() // 1_000_000


async def get_versions(redis: "AsyncRedisClient", keys: list[str]) -> list[int]:
    """
    批量读取版本号；缺失的 key 以时间戳 ``SET NX`` 初始化，版本不设 TTL、不回落。

    Args:
        redis: AsyncRedisClient 实例。
        keys: 版本号 key 列表。

    Returns:
        与 ``keys`` 顺序一致的版本号列表。
    """
    if not keys:
        return []
    values = await redis.mget(keys)
    if all(value is not None for value in values):
        return [int(value) for value in values]

    seed = _seed_version()
    for key, value in zip(keys, values):
        if value is None:
            await redis.set(key, seed, nx=True)
    values = await redis.mget(keys)
    return [int(value) if value is not None else seed for value in values]


async def bump_version(redis: "AsyncRedisClient", key: str) -> int:
    """递增版本号；key 缺失时先以时间戳初始化。"""
    await redis.set(key, _seed_version(), nx=True)
    return await redis.incr(key)


async def get_or_rebuild(
    redis: "AsyncRedisClient",
    key: str,
    loader: Callable[[], Awaitable[str]],
    *,
    ttl: int | timedelta,
    lock_ttl: int = 3,
    wait_ms: int = 1000,
) -> str:
    """
    单飞读取缓存：未命中时只有持锁者执行 ``loader`` 回源，其余请求短暂等待结果。

    等待超时后直接执行 ``loader``，但不写入缓存，保证请求不被阻塞。

    Args:
        redis: AsyncRedisClient 实例。
        key: 缓存 key。
        loader: 回源函数，返回序列化后的缓存值。
        ttl: 缓存过期时间。
        lock_ttl: 重建锁过期时间（秒）。
        wait_ms: 未抢到锁时的最长等待时间（毫秒）。

    Returns:
        缓存值。
    """
    cached = await redis.get(key)
    if cached is not None:
        return cached

    lock = DistributedLock(redis, f"{key}:lock", ttl=lock_ttl)
    if await lock.acquire():
        try:
            cached = await redis.get(key)
            if cached is not None:
                return cached
            value = await loader()
            await redis.set(key, value, ex=ttl)
            return value
        finally:
            try:
                await lock.release()
            except LockError:
                logger.debug("Cache rebuild lock expired before release: {key}", key=key)

    deadline = time.monotonic() + wait_ms / 1000
    while time.monotonic() < deadline:
        await asyncio.sleep(random.uniform(0.05, 0.1))  # noqa: S311
        cached = await redis.get(key)
        if cached is not None:
            return cached

    logger.debug("Cache rebuild wait timed out, loading directly: {key}", key=key)
    return await loader()
