"""
插件级缓存管理器 — 带命名空间隔离的 Redis 缓存封装。

Author : Coke
Date   : 2026-04-14
"""

from typing import TYPE_CHECKING

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
