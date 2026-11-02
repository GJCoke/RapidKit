import asyncio
from contextlib import suppress

import pytest_asyncio
from rapidkit_core import runtime_state
from rapidkit_core.database import RedisManager
from rapidkit_core.redis_client import AsyncRedisClient
from src.middlewares import metrics
from src.middlewares.logger import LoggerMiddleware
from src.prometheus import HTTPMetrics


@pytest_asyncio.fixture
async def blackhole():
    connected, stop = asyncio.Event(), asyncio.Event()
    writers = []

    async def hold(reader, writer):
        writers.append(writer)
        connected.set()
        try:
            await stop.wait()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(hold, "127.0.0.1", 0)
    client = AsyncRedisClient.from_url(
        f"redis://127.0.0.1:{server.sockets[0].getsockname()[1]}/0", max_connections=10, decode_responses=True
    )
    yield client, connected
    stop.set()
    await client.aclose()
    server.close()
    await server.wait_closed()
    for writer in writers:
        writer.close()
        with suppress(ConnectionError):
            await writer.wait_closed()


async def test_metrics_use_an_independent_pool_while_business_redis_stays_available(redis, blackhole, monkeypatch):
    blocked, connected = blackhole
    monkeypatch.setattr(RedisManager, "_clients", {"default": redis, "request_metrics": blocked})
    task = asyncio.create_task(metrics._record_metrics(status_code=200, duration_ms=1, path="/isolation"))
    connection = asyncio.create_task(connected.wait())
    try:
        await asyncio.wait([task, connection], timeout=1, return_when=asyncio.FIRST_COMPLETED)
        assert connected.is_set(), "metrics must connect to their own pool"
        assert await redis.ping()
    finally:
        task.cancel()
        connection.cancel()
        await asyncio.gather(task, connection, return_exceptions=True)


async def test_blackholed_metrics_timeout_count_drops_and_recover_on_real_redis(redis, blackhole, monkeypatch):
    blocked, connected = blackhole
    clients = {"default": blocked, "request_metrics": blocked}
    monkeypatch.setattr(RedisManager, "_clients", clients)
    drops, failures, recovered = [], [], []
    monkeypatch.setattr(runtime_state, "increment", lambda name, *args: drops.append(name))
    monkeypatch.setattr(metrics, "component_failed", lambda name, error: failures.append((name, type(error))))
    monkeypatch.setattr(metrics, "component_recovered", recovered.append)
    tasks = [
        asyncio.create_task(metrics._record_metrics(status_code=200, duration_ms=1, path="/deadline")) for _ in range(2)
    ]
    try:
        done, _ = await asyncio.wait(tasks, timeout=2.5)
        assert connected.is_set()
        assert len(done) == 2, "a connected but silent peer must not retain metrics tasks"
        assert drops.count("request_metrics_dropped") == 2
        assert failures == [("request_metrics", TimeoutError)] * 2
        clients["request_metrics"] = redis
        await metrics._record_metrics(status_code=200, duration_ms=1, path="/recovered")
        assert recovered == ["request_metrics"]
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def test_http_burst_bounds_metrics_tasks_without_losing_http_counts(monkeypatch):
    release = asyncio.Event()
    drops = []

    async def blocked(**kwargs):
        await release.wait()

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b""}

    statuses = []

    async def send(message):
        if message["type"] == "http.response.start":
            statuses.append(message["status"])

    monkeypatch.setattr(metrics, "_background_tasks", set())
    monkeypatch.setattr(metrics, "_record_metrics", blocked)
    monkeypatch.setattr(runtime_state, "increment", lambda name, *args: drops.append(name))
    counters = HTTPMetrics()
    wrapped = LoggerMiddleware(app, metrics=counters, record_redis=True)
    try:
        for _ in range(50):
            await wrapped({"type": "http", "path": "/burst", "method": "GET", "headers": []}, receive, send)
        assert statuses == [200] * 50
        assert len(metrics._background_tasks) <= 10
        assert drops.count("request_metrics_dropped") == 40
        assert (
            'rapidkit_http_requests_total{method="GET",outcome="success",route="unmatched"} 50.0'
            in counters.render().decode()
        )
    finally:
        release.set()
        await asyncio.gather(*metrics._background_tasks, return_exceptions=True)
