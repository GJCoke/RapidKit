"""
Async Redis Client.

Author : Coke
Date   : 2025-05-13
"""

import json
from typing import Any, Set, TypeVar, overload

from pydantic import BaseModel
from redis import Redis as SyncRedis
from redis.asyncio import Redis
from redis.asyncio.client import Pipeline
from sqlmodel import SQLModel

from rapidkit_core.dependency_observation import observe_dependency

T = TypeVar("T", bound=BaseModel)


def _operation(command: object) -> str:
    # Only the fixed command verb is inspected, never a key or value.
    name = command.decode("ascii", errors="ignore") if isinstance(command, bytes) else str(command)
    name = name.upper()
    if name in {"XREAD", "XREADGROUP", "BLPOP", "BRPOP", "BLMOVE", "BRPOPLPUSH", "BZPOPMIN", "BZPOPMAX"}:
        return "wait"
    if name in {"GET", "MGET", "EXISTS", "TTL", "PTTL"}:
        return "get"
    if name in {"SET", "MSET", "SETEX", "PSETEX", "DEL", "UNLINK", "EXPIRE", "PEXPIRE", "INCR", "INCRBY"}:
        return "set"
    if name.startswith("H") and name in {"HGET", "HGETALL", "HSET", "HDEL", "HINCRBY", "HMGET", "HEXISTS"}:
        return "hash"
    if name in {"LPUSH", "RPUSH", "LPOP", "RPOP", "LLEN", "LRANGE", "LMOVE", "LREM", "BLPOP", "BRPOP"}:
        return "list"
    if name in {"SADD", "SREM", "SMEMBERS", "SCARD", "SISMEMBER"}:
        return "set_members"
    if name in {"ZADD", "ZREM", "ZRANGE", "ZCARD", "ZREMRANGEBYSCORE"}:
        return "sorted_set"
    if name in {"XADD", "XREAD", "XREADGROUP", "XACK", "XINFO", "XPENDING", "XRANGE", "XAUTOCLAIM", "XGROUP", "XLEN"}:
        return "stream"
    if name in {"EVAL", "EVALSHA", "SCRIPT"}:
        return "script"
    return "other"


class RedisClient(SyncRedis):
    def execute_command(self, *args, **kwargs):
        with observe_dependency("redis", _operation(args[0] if args else "")):
            return super().execute_command(*args, **kwargs)


class ObservedPipeline(Pipeline):
    async def execute(self, raise_on_error: bool = True):
        with observe_dependency("redis", "pipeline"):
            return await super().execute(raise_on_error=raise_on_error)


def _validate_model_json(model: type[T], data: str | bytes) -> T:
    # SQLModel tables skip JSON field validation; other schemas retain JSON-mode semantics.
    if issubclass(model, SQLModel) and model.model_config.get("table"):
        return model.model_validate(json.loads(data))
    return model.model_validate_json(data)


class AsyncRedisClient(Redis):  # type: ignore[type-arg]
    """
    基于 asyncio 的 Redis 客户端。

    继承 redis.asyncio.Redis，拥有所有原生 Redis 方法，
    并扩展 Pydantic 模型的自动序列化与反序列化能力。
    """

    async def execute_command(self, *args, **kwargs):
        with observe_dependency("redis", _operation(args[0] if args else "")):
            return await super().execute_command(*args, **kwargs)

    def pipeline(self, transaction: bool = True, shard_hint: str | None = None):
        return ObservedPipeline(self.connection_pool, self.response_callbacks, transaction, shard_hint)

    async def set(self, name: str, value: str | int | float | BaseModel, *args: Any, **kwargs: Any) -> bool | None:
        if isinstance(value, BaseModel):
            value = value.model_dump_json()
        return await super().set(name, value, *args, **kwargs)

    @overload
    async def get(self, name: str, *, response_model: type[T]) -> T | None: ...

    @overload
    async def get(self, name: str, *, response_model: None = None) -> str | None: ...

    async def get(self, name: str, *, response_model: type[T] | None = None) -> T | str | None:
        data = await super().get(name)
        if data is None or response_model is None:
            return data
        return _validate_model_json(response_model, data)

    async def hset(
        self,
        name: str,
        key: str | None = None,
        value: str | None = None,
        mapping: dict[str, str] | BaseModel | None = None,
        items: list[tuple[str, str]] | None = None,
    ) -> int:
        if isinstance(mapping, BaseModel):
            mapping = {k: str(v) if not isinstance(v, str) else v for k, v in mapping.model_dump().items()}
        return await super().hset(name, key=key, value=value, mapping=mapping, items=items)  # ty: ignore[invalid-await]

    @overload
    async def hget(self, name: str, key: str, *, response_model: type[T]) -> T | None: ...

    @overload
    async def hget(self, name: str, key: str, *, response_model: None = None) -> str | None: ...

    async def hget(self, name: str, key: str, *, response_model: type[T] | None = None) -> T | str | None:
        data = await super().hget(name, key)  # ty: ignore[invalid-await]
        if data is None or response_model is None:
            return data
        return _validate_model_json(response_model, data)

    async def hincrby(self, name: str, key: str, amount: int = 1) -> int:
        return await super().hincrby(name, key, amount)  # ty: ignore[invalid-await]

    @overload
    async def hgetall(self, name: str, *, response_model: type[T]) -> T: ...

    @overload
    async def hgetall(self, name: str, *, response_model: None = None) -> dict[str, str]: ...

    async def hgetall(self, name: str, *, response_model: type[T] | None = None) -> T | dict[str, str]:
        data = await super().hgetall(name)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return response_model.model_validate(data)

    async def lpush(self, name: str, *values: str | BaseModel) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().lpush(name, *serialized)  # ty: ignore[invalid-await]

    async def rpush(self, name: str, *values: str | BaseModel) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().rpush(name, *serialized)  # ty: ignore[invalid-await]

    @overload
    async def lrange(self, name: str, start: int, end: int, *, response_model: type[T]) -> list[T]: ...

    @overload
    async def lrange(self, name: str, start: int, end: int, *, response_model: None = None) -> list[str]: ...

    async def lrange(
        self, name: str, start: int, end: int, *, response_model: type[T] | None = None
    ) -> list[T] | list[str]:
        data = await super().lrange(name, start, end)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return [_validate_model_json(response_model, item) for item in data]

    async def sadd(self, name: str, *values: str | BaseModel) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().sadd(name, *serialized)  # ty: ignore[invalid-await]

    async def srem(self, name: str, *values: str | BaseModel) -> int:
        serialized = [v.model_dump_json() if isinstance(v, BaseModel) else v for v in values]
        return await super().srem(name, *serialized)  # ty: ignore[invalid-await]

    async def scard(self, name: str) -> int:
        return await super().scard(name)  # ty: ignore[invalid-await]

    @overload
    async def smembers(self, name: str, *, response_model: type[T]) -> Set[T]: ...

    @overload
    async def smembers(self, name: str, *, response_model: None = None) -> Set[str]: ...

    async def smembers(self, name: str, *, response_model: type[T] | None = None) -> Set[T] | Set[str]:
        data = await super().smembers(name)  # ty: ignore[invalid-await]
        if not data or response_model is None:
            return data
        return {_validate_model_json(response_model, item) for item in data}
