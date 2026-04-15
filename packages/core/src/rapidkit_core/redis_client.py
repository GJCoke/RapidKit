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
    """

    async def set(self, name: str, value: Any, *args, **kwargs) -> Any:
        if isinstance(value, BaseModel):
            value = value.model_dump_json()
        return await super().set(name, value, *args, **kwargs)

    async def get(self, name: str, *, response_model: type[T] | None = None) -> Any:
        data = await super().get(name)
        if data is None or response_model is None:
            return data
        return response_model.model_validate_json(data)

    async def hset(
        self, name: str, key: str | None = None, value: str | None = None,
        mapping: Any = None, items: list | None = None,
    ) -> int:
        if isinstance(mapping, BaseModel):
            mapping = {k: str(v) if not isinstance(v, str) else v for k, v in mapping.model_dump().items()}
        return await super().hset(name, key=key, value=value, mapping=mapping, items=items)  # ty: ignore[invalid-await]

    async def hgetall(self, name: str, *, response_model: type[T] | None = None) -> Any:
        data = await super().hgetall(name)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return response_model.model_validate(data)

    async def lpush(self, name: str, *values: Any) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().lpush(name, *serialized)  # ty: ignore[invalid-await]

    async def rpush(self, name: str, *values: Any) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().rpush(name, *serialized)  # ty: ignore[invalid-await]

    async def lrange(self, name: str, start: int, end: int, *, response_model: type[T] | None = None) -> Any:
        data = await super().lrange(name, start, end)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return [response_model.model_validate_json(item) for item in data]

    async def sadd(self, name: str, *values: Any) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().sadd(name, *serialized)  # ty: ignore[invalid-await]

    async def smembers(self, name: str, *, response_model: type[T] | None = None) -> Any:
        data = await super().smembers(name)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return {response_model.model_validate_json(item) for item in data}
