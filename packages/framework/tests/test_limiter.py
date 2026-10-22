"""Async Redis limits share counters across replicas without blocking the loop."""

import asyncio
import os
from uuid import uuid4

import pytest
import pytest_asyncio
from rapidkit_framework.limiter import RateLimiterService

REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


@pytest_asyncio.fixture
async def services():
    first, second = RateLimiterService(REDIS_URL), RateLimiterService(REDIS_URL)
    try:
        yield first, second, str(uuid4())
    finally:
        await first.close()
        await second.close()


@pytest.mark.asyncio
async def test_default_limits_isolate_users_behind_nat(services):
    first, second, scope = services
    for index in range(600):
        service = (first, second)[index % 2]
        for user in ("user:one", "user:two"):
            assert await service.check([(scope, user, "600/minute")]) is None
    assert await first.check([(scope, "user:one", "600/minute")]) >= 1
    for _ in range(120):
        assert await first.check([(scope, "ip:203.0.113.8", "120/minute")]) is None
    assert await second.check([(scope, "ip:203.0.113.8", "120/minute")]) >= 1
    assert await second.check([(scope, "user:three", "600/minute")]) is None


@pytest.mark.asyncio
async def test_concurrent_replicas_share_atomic_counter(services):
    first, second, scope = services
    results = await asyncio.gather(
        *((first, second)[index % 2].check([(scope, "client", "30/minute")]) for index in range(50))
    )
    assert results.count(None) == 30
    assert all(result is None or result >= 1 for result in results)


@pytest.mark.asyncio
async def test_slow_redis_does_not_block_other_tasks(services, monkeypatch):
    first, _, scope = services
    entered, release = asyncio.Event(), asyncio.Event()
    incr = first._storage.incr

    async def slow(*args, **kwargs):
        entered.set()
        await release.wait()
        return await incr(*args, **kwargs)

    monkeypatch.setattr(first._storage, "incr", slow)
    check = asyncio.create_task(first.check([(scope, "client", "1/minute")]))
    await asyncio.wait_for(entered.wait(), 1)
    assert not check.done()
    release.set()
    assert await check is None
