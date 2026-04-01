"""
Async Redis Client.

Author : Coke
Date   : 2025-05-13
"""

from typing import Any, TypeVar

from pydantic import BaseModel
from redis.asyncio import Redis

T = TypeVar("T", bound=BaseModel)


class AsyncRedisClient(Redis):
    """
    基于 asyncio 的 Redis 客户端。

    继承 redis.asyncio.Redis，拥有所有原生 Redis 方法，
    并扩展 Pydantic 模型的自动序列化与反序列化能力。

    - set / get: 传入 BaseModel 自动序列化，get 时通过 response_model 反序列化
    - hset / hgetall: 传入 BaseModel 自动 model_dump，hgetall 通过 response_model 还原
    - lpush / lrange: 传入 BaseModel 自动序列化每个元素，lrange 通过 response_model 还原
    - sadd / smembers: 传入 BaseModel 自动序列化每个元素，smembers 通过 response_model 还原
    """

    async def set(self, name: str, value: Any, *args, **kwargs) -> Any:
        """
        设置 Redis 键值对。

        当 value 为 Pydantic BaseModel 实例时，自动序列化为 JSON 字符串。
        其他类型直接透传给原生 Redis set。
        """
        if isinstance(value, BaseModel):
            value = value.model_dump_json()
        return await super().set(name, value, *args, **kwargs)  # ty: ignore[invalid-await]

    async def get(self, name: str, *, response_model: type[T] | None = None) -> Any:
        """
        获取 Redis 键值。

        Args:
            name: Redis 键。
            response_model: 可选的 Pydantic 模型类。指定时自动反序列化 JSON 为模型实例。

        Returns:
            指定 response_model 时返回模型实例或 None；否则返回原始字符串或 None。
        """
        data = await super().get(name)  # ty: ignore[invalid-await]
        if data is None or response_model is None:
            return data
        return response_model.model_validate_json(data)

    async def hset(
        self,
        name: str,
        key: str | None = None,
        value: str | None = None,
        mapping: Any = None,
        items: list | None = None,
    ) -> int:
        """
        设置 Redis 哈希表字段。

        当 mapping 为 Pydantic BaseModel 实例时，自动转换为 dict（model_dump, 将值转为 str）。
        """
        if isinstance(mapping, BaseModel):
            mapping = {k: str(v) if not isinstance(v, str) else v for k, v in mapping.model_dump().items()}
        return await super().hset(name, key=key, value=value, mapping=mapping, items=items)  # ty: ignore[invalid-await]

    async def hgetall(self, name: str, *, response_model: type[T] | None = None) -> Any:
        """
        获取 Redis 哈希表所有字段。

        Args:
            name: Redis 键。
            response_model: 可选的 Pydantic 模型类。指定时自动从 dict 还原为模型实例。

        Returns:
            指定 response_model 时返回模型实例；否则返回原始 dict。
        """
        data = await super().hgetall(name)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return response_model.model_validate(data)

    async def lpush(self, name: str, *values: Any) -> int:
        """
        向 Redis 列表头部插入元素。

        当元素为 Pydantic BaseModel 实例时，自动序列化为 JSON 字符串。
        """
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().lpush(name, *serialized)  # ty: ignore[invalid-await]

    async def rpush(self, name: str, *values: Any) -> int:
        """
        向 Redis 列表尾部插入元素。

        当元素为 Pydantic BaseModel 实例时，自动序列化为 JSON 字符串。
        """
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().rpush(name, *serialized)  # ty: ignore[invalid-await]

    async def lrange(self, name: str, start: int, end: int, *, response_model: type[T] | None = None) -> Any:
        """
        获取 Redis 列表指定范围的元素。

        Args:
            name: Redis 键。
            start: 起始索引。
            end: 结束索引。
            response_model: 可选的 Pydantic 模型类。指定时自动反序列化每个元素。

        Returns:
            指定 response_model 时返回模型实例列表；否则返回原始字符串列表。
        """
        data = await super().lrange(name, start, end)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return [response_model.model_validate_json(item) for item in data]

    async def sadd(self, name: str, *values: Any) -> int:
        """
        向 Redis 集合添加元素。

        当元素为 Pydantic BaseModel 实例时，自动序列化为 JSON 字符串。
        """
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().sadd(name, *serialized)  # ty: ignore[invalid-await]

    async def smembers(self, name: str, *, response_model: type[T] | None = None) -> Any:
        """
        获取 Redis 集合所有成员。

        Args:
            name: Redis 键。
            response_model: 可选的 Pydantic 模型类。指定时自动反序列化每个成员。

        Returns:
            指定 response_model 时返回模型实例集合；否则返回原始字符串集合。
        """
        data = await super().smembers(name)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return {response_model.model_validate_json(item) for item in data}
