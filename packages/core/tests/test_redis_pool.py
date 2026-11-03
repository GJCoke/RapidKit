"""Shared Redis pool waits for capacity without stalling the event loop."""

import asyncio
import socket
import time

import pytest
from pydantic import ValidationError
from rapidkit_core.config import RedisConfigMixin, settings
from rapidkit_core.database import RedisManager
from redis.exceptions import ConnectionError


@pytest.fixture
async def shared_pool(monkeypatch):
    monkeypatch.setattr(RedisManager, "_pools", {})
    monkeypatch.setattr(RedisManager, "_clients", {})
    monkeypatch.setitem(settings.__dict__, "REDIS_POOL_TIMEOUT_SECONDS", 0.15)
    pool = RedisManager.connect(max_connections=2)
    try:
        yield pool, RedisManager.client()
    finally:
        await RedisManager.clear()


async def test_full_pool_waits_and_serves_burst_after_release(shared_pool):
    pool, client = shared_pool
    borrowed = [await pool.get_connection() for _ in range(2)]
    tasks = [asyncio.create_task(client.ping()) for _ in range(20)]
    try:
        await asyncio.sleep(0.02)
        assert not any(task.done() for task in tasks), "full shared pool rejected callers instead of waiting"
        assert len(pool._in_use_connections) == 2
        for connection in borrowed:
            await pool.release(connection)
        borrowed.clear()
        assert await asyncio.wait_for(asyncio.gather(*tasks), 1) == [True] * 20
        assert len(pool._available_connections) <= 2
    finally:
        for connection in borrowed:
            await pool.release(connection)
        await asyncio.gather(*tasks, return_exceptions=True)


async def test_full_pool_times_out_without_leaking_capacity(shared_pool):
    pool, client = shared_pool
    borrowed = [await pool.get_connection() for _ in range(2)]
    started = time.monotonic()
    try:
        with pytest.raises(ConnectionError):
            await asyncio.wait_for(client.ping(), 1)
        assert 0.1 <= time.monotonic() - started < 1
    finally:
        for connection in borrowed:
            await pool.release(connection)
    assert await client.ping() is True


async def test_cancelling_waiter_preserves_capacity_for_next_caller(shared_pool):
    pool, client = shared_pool
    borrowed = [await pool.get_connection() for _ in range(2)]
    waiter = asyncio.create_task(client.ping())
    try:
        await asyncio.sleep(0.02)
        waiter.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiter
    finally:
        for connection in borrowed:
            await pool.release(connection)
        await asyncio.gather(waiter, return_exceptions=True)
    assert await client.ping() is True
    assert len(pool._in_use_connections) == 0


async def test_unreachable_named_pool_still_raises_connection_error(shared_pool):
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        pool = RedisManager.connect(
            redis_url=f"redis://127.0.0.1:{reserved.getsockname()[1]}/0", pool_name="offline", max_connections=1
        )
        with pytest.raises(ConnectionError):
            await asyncio.wait_for(RedisManager.client("offline").ping(), 1)
    assert len(pool._in_use_connections) == 0
    assert await RedisManager.client().ping() is True


@pytest.mark.parametrize("value", [0, -1, float("inf"), float("nan")])
def test_pool_wait_configuration_rejects_non_positive_or_unbounded_values(value):
    with pytest.raises(ValidationError):
        RedisConfigMixin(REDIS_HOST="localhost", REDIS_ROOT_PASSWORD="", REDIS_POOL_TIMEOUT_SECONDS=value)


def test_pool_capacity_configuration_rejects_unbounded_zero():
    with pytest.raises(ValidationError):
        RedisConfigMixin(REDIS_HOST="localhost", REDIS_ROOT_PASSWORD="", REDIS_MAX_CONNECTIONS=0)
