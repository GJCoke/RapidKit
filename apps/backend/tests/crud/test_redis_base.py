"""
Async redis client testcase.

Author : Coke
Date   : 2025-05-13
"""

import random

import pytest
import pytest_asyncio
from pydantic import BaseModel
from rapidkit_core.redis_client import AsyncRedisClient
from redis.asyncio import Redis

from tests.utils import random_lowercase, random_uppercase


@pytest_asyncio.fixture
async def redis_client(redis: Redis) -> AsyncRedisClient:
    await redis.flushall()
    pool = redis.connection_pool
    return AsyncRedisClient(connection_pool=pool)


# ==================== Native Redis Methods ====================


@pytest.mark.asyncio
async def test_redis_set_str(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    random_value = random_uppercase()
    await redis_client.set(random_key, random_value)
    assert await redis_client.get(random_key) == random_value


@pytest.mark.asyncio
async def test_redis_set_int(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    random_int = random.randint(1, 100)
    await redis_client.set(random_key, random_int)
    assert int(await redis_client.get(random_key)) == random_int


@pytest.mark.asyncio
async def test_redis_set_float(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    random_float = random.uniform(1.0, 10.0)
    await redis_client.set(random_key, random_float)
    assert float(await redis_client.get(random_key)) == random_float


@pytest.mark.asyncio
async def test_redis_exists(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    random_value = random_uppercase()
    await redis_client.set(random_key, random_value)
    assert await redis_client.exists(random_key)


@pytest.mark.asyncio
async def test_redis_not_exists(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    assert not await redis_client.exists(random_key)


@pytest.mark.asyncio
async def test_redis_delete(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    random_value = random_uppercase()
    await redis_client.set(random_key, random_value)
    assert await redis_client.delete(random_key)
    assert not await redis_client.exists(random_key)


# ==================== Pydantic set / get ====================


class SampleModel(BaseModel):
    name: str
    age: int
    tags: list[str] = []

    def __hash__(self) -> int:
        return hash((self.name, self.age))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, SampleModel):
            return NotImplemented
        return self.name == other.name and self.age == other.age


@pytest.mark.asyncio
async def test_set_get_pydantic_model(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    model = SampleModel(name="test", age=25, tags=["a", "b"])
    await redis_client.set(random_key, model)
    result = await redis_client.get(random_key, response_model=SampleModel)
    assert result == model


@pytest.mark.asyncio
async def test_get_missing_key_with_response_model(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    result = await redis_client.get(random_key, response_model=SampleModel)
    assert result is None


@pytest.mark.asyncio
async def test_set_pydantic_model_with_ttl(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    model = SampleModel(name="ttl_test", age=30)
    await redis_client.set(random_key, model, ex=3600)
    ttl = await redis_client.ttl(random_key)
    assert ttl > 0
    result = await redis_client.get(random_key, response_model=SampleModel)
    assert result == model


# ==================== Pydantic hset / hgetall ====================


class HashModel(BaseModel):
    field1: str
    field2: str


@pytest.mark.asyncio
async def test_hset_hgetall_pydantic_model(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    model = HashModel(field1="hello", field2="world")
    await redis_client.hset(random_key, mapping=model)
    result = await redis_client.hgetall(random_key, response_model=HashModel)
    assert result == model


@pytest.mark.asyncio
async def test_hset_hgetall_plain_dict(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    mapping = {"a": "1", "b": "2"}
    await redis_client.hset(random_key, mapping=mapping)
    result = await redis_client.hgetall(random_key)
    assert result == mapping


# ==================== Pydantic lpush / lrange ====================


@pytest.mark.asyncio
async def test_lpush_lrange_pydantic_models(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    m1 = SampleModel(name="a", age=1)
    m2 = SampleModel(name="b", age=2)
    await redis_client.lpush(random_key, m1, m2)
    result = await redis_client.lrange(random_key, 0, -1, response_model=SampleModel)
    assert set(r.name for r in result) == {"a", "b"}


@pytest.mark.asyncio
async def test_lpush_lrange_plain_values(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    await redis_client.lpush(random_key, "x", "y")
    result = await redis_client.lrange(random_key, 0, -1)
    assert set(result) == {"x", "y"}


# ==================== Pydantic sadd / smembers ====================


@pytest.mark.asyncio
async def test_sadd_smembers_pydantic_models(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    m1 = SampleModel(name="a", age=1)
    m2 = SampleModel(name="b", age=2)
    await redis_client.sadd(random_key, m1, m2)
    result = await redis_client.smembers(random_key, response_model=SampleModel)
    assert {r.name for r in list[result]} == {"a", "b"}


@pytest.mark.asyncio
async def test_sadd_smembers_plain_values(redis_client: AsyncRedisClient) -> None:
    random_key = random_lowercase()
    await redis_client.sadd(random_key, "x", "y")
    result = await redis_client.smembers(random_key)
    assert result == {"x", "y"}
