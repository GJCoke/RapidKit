"""
Async Redis Client.

Author : Coke
Date   : 2025-05-13
"""

import logging
from datetime import timedelta
from typing import Any, Set, overload

from redis.asyncio import Redis
from redis.typing import EncodableT, KeyT

logger = logging.getLogger(__name__)


# TODO: Support Pydantic and refactor.
class AsyncRedisClient:
    """
    基于 asyncio 的 Redis 客户端。

    封装 Redis 客户端实例，提供异步方法操作 Redis，并支持 echo 日志输出。
    """

    def __init__(self, client: Redis, echo: bool = False) -> None:
        """
        初始化 AsyncRedisClient。

        Args:
            client: Redis 客户端实例。
            echo: 是否输出 Redis 命令日志，默认 False。
        """
        self._client: Redis = client
        self._echo = echo
        self.logger = logging.getLogger("redis")
        self.logger.setLevel(logging.DEBUG if echo else logging.FATAL)

    @property
    def client(self) -> Redis:
        """
        获取 Redis 客户端实例。

        Returns:
            Redis: Redis 客户端。
        """
        return self._client

    @property
    def echo(self) -> bool:
        """
        获取是否输出 Redis 命令日志的标志。

        Returns:
            bool: echo 标志。
        """
        return self._echo

    @staticmethod
    def _to_str(key: KeyT) -> str:
        """
        将输入 key（memoryview、bytes 或其他类型）转换为字符串。

        Args:
            key: 输入值，可以是 memoryview、bytes 或其他类型。

        Returns:
            str: 转换后的字符串。
        """

        if isinstance(key, memoryview):
            return key.tobytes().decode("utf-8")
        if isinstance(key, bytes):
            return key.decode("utf-8")
        return str(key)

    def _get_log(self, key: KeyT, response: Any) -> None:
        """
        记录 Redis key 的访问及响应结果。

        Args:
            key: 被访问的 Redis key。
            response: Redis 返回的数据。
        """
        self.logger.info('Attempting to retrieve value for key: "%s" from Redis.', key)
        self.logger.debug('Successfully retrieved value for key "%s": %s', key, response)

    @overload
    async def set(
        self,
        key: str,
        value: EncodableT | dict | list | Set,
        *,
        ttl: int | timedelta | None = None,
        is_transaction: bool = False,
    ) -> None: ...

    @overload
    async def set(
        self,
        key: KeyT,
        value: EncodableT,
        *,
        ttl: int | timedelta | None = None,
        is_transaction: bool = False,
    ) -> None: ...

    async def set(
        self,
        key: KeyT,
        value: EncodableT | dict | list | Set,
        *,
        ttl: int | timedelta | None = None,
        is_transaction: bool = False,
    ) -> None:
        """
        设置 Redis 的键值对。

        Args:
            key: Redis 键。
            value: 存储的值（可为 dict、list、set 或基本类型）。
            ttl: 键的过期时间，默认 None。
            is_transaction: 是否作为事务执行。
        """

        async with self.client.pipeline(transaction=is_transaction) as pipe:
            if isinstance(value, dict):
                await pipe.hset(self._to_str(key), mapping=value)  # type: ignore

            elif isinstance(value, list):
                await pipe.lpush(self._to_str(key), *value)  # type: ignore

            elif isinstance(value, set):
                await pipe.sadd(self._to_str(key), *value)  # type: ignore

            else:
                await pipe.set(key, value)

            if ttl is not None:
                await pipe.expire(key, ttl)

            await pipe.execute()

        self.logger.info(
            'Setting key: "%s" with value: %s in Redis.',
            key,
            value,
        )

    async def get(self, key: KeyT) -> str:
        """
        获取指定 key 的值。

        Args:
            key: Redis 键。

        Returns:
            str: 键对应的值。
        """

        response = await self.client.get(key)

        self._get_log(key, response)
        return response

    async def get_mapping(self, key: str) -> dict:
        """
        获取 Redis 哈希表中所有字段和值。

        Args:
            key: Redis 哈希表的键。

        Returns:
            dict: 哈希表的所有字段和值。
        """
        response = await self.client.hgetall(key)  # type: ignore

        self._get_log(key, response)
        return response

    async def get_array(self, key: str, *, start: int = 0, end: int = -1) -> list:
        """
        获取 Redis 列表指定范围的元素。

        Args:
            key: Redis 列表的键。
            start: 起始索引，默认 0。
            end: 结束索引，默认 -1（到末尾）。

        Returns:
            list: 指定范围的元素列表。
        """
        response = await self.client.lrange(key, start=start, end=end)  # type: ignore

        self._get_log(key, response)
        return response

    async def get_sets(self, key: str) -> Set:
        """
        获取 Redis 集合的所有成员。

        Args:
            key: Redis 集合的键。

        Returns:
            set: 集合的所有成员。
        """
        return await self.client.smembers(key)  # type: ignore

    async def exists(self, *args: KeyT) -> int:
        """
        检查 Redis 中的键是否存在。

        Args:
            args: 要检查的键。

        Returns:
            int: 存在的键数量。
        """
        response = await self.client.exists(*args)
        return response

    async def delete(self, *args: KeyT) -> bool:
        """
        删除 Redis 中的一个或多个键。

        Args:
            args: 要删除的键。

        Returns:
            bool: 删除成功返回 True，否则返回 False。
        """

        response = await self.client.delete(*args)

        self.logger.info("Attempting to delete key(s): %s from Redis.", args)
        if response:
            self.logger.debug("Successfully deleted key(s): %s", args)
        else:
            self.logger.debug("Failed to delete key(s): %s. The key(s) may not exist.", args)

        return bool(response)

    async def delete_set(self, key: str, *args: EncodableT) -> int:
        """
        移除 Redis 集合中的一个或多个元素。

        Args:
            key: Redis 集合的键。
            *args: 要移除的元素。

        Returns:
            int: 被移除的元素数量。
        """
        return await self.client.srem(key, *args)  # type: ignore
