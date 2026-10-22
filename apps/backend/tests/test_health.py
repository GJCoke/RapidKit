"""Public internal probes must bypass business instrumentation and fail safely."""

import asyncio
import importlib
import os
import signal
import socket
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import httpx


async def test_live_never_touches_dependencies(loaded_app, monkeypatch):
    from rapidkit_core.database import RedisManager

    def unavailable():
        raise AssertionError("Liveness must not access Redis")

    monkeypatch.setattr(RedisManager, "client", unavailable)
    async with AsyncClient(transport=ASGITransport(app=loaded_app), base_url="http://test") as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.fixture
def probes(monkeypatch):
    health = importlib.import_module("src.health")
    connection = SimpleNamespace(execute=AsyncMock())

    @asynccontextmanager
    async def connect():
        yield connection

    redis = SimpleNamespace(ping=AsyncMock(return_value=True))
    monkeypatch.setattr(health, "async_engine", SimpleNamespace(connect=connect))
    monkeypatch.setattr(health.RedisManager, "client", lambda: redis)
    app = FastAPI()
    app.state.shutting_down = False
    app.include_router(health.router)
    return app, connection, redis


async def test_ready_success_and_shutdown(probes):
    app, connection, redis = probes
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "checks": {"postgresql": "ok", "redis": "ok"}}
        assert str(connection.execute.call_args.args[0]) == "SELECT 1"
        app.state.shutting_down = True
        response = await client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["status"] == "unavailable"
        assert redis.ping.await_count == 1


@pytest.mark.parametrize("dependency", ["postgresql", "redis"])
async def test_ready_dependency_failure_is_sanitized(probes, dependency):
    app, connection, redis = probes
    probe = connection.execute if dependency == "postgresql" else redis.ping
    probe.side_effect = RuntimeError("postgresql://name:secret@private-host/db")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"][dependency] == "unavailable"
    assert set(response.json()["checks"]) == {"postgresql", "redis"}
    assert "secret" not in response.text
    assert "private-host" not in response.text


async def test_ready_timeouts_are_concurrent(probes):
    app, connection, redis = probes

    async def stalled(*args, **kwargs):
        await asyncio.sleep(10)

    connection.execute.side_effect = stalled
    redis.ping.side_effect = stalled
    started = time.monotonic()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"] == {"postgresql": "unavailable", "redis": "unavailable"}
    assert time.monotonic() - started < 3


def test_shutdown_signal_chains_previous_handler_and_restores():
    from src.health import shutdown_readiness

    app = FastAPI()
    observed = []

    def previous(signum, frame):
        observed.append((signum, app.state.shutting_down))

    saved = signal.signal(signal.SIGTERM, previous)
    try:
        with shutdown_readiness(app):
            handler = signal.getsignal(signal.SIGTERM)
            handler(signal.SIGTERM, None)
            assert app.state.shutting_down is True
        assert signal.getsignal(signal.SIGTERM) is previous
        assert observed == [(signal.SIGTERM, True)]
    finally:
        signal.signal(signal.SIGTERM, saved)


async def test_health_bypasses_metrics_and_limiter(loaded_app, probes, monkeypatch):
    from src.middlewares import metrics

    class ForbiddenLimiter:
        def __getattr__(self, name):
            raise AssertionError("Internal routes must not access the limiter")

    recorded = []

    async def record(**kwargs):
        recorded.append(kwargs)

    monkeypatch.setattr(metrics, "_record_metrics", record)
    monkeypatch.setattr(loaded_app.state, "limiter", ForbiddenLimiter())
    monkeypatch.setattr(loaded_app.state, "shutting_down", False, raising=False)
    async with AsyncClient(transport=ASGITransport(app=loaded_app), base_url="http://test") as client:
        for path in ("/health/live", "/health/ready"):
            assert (await client.get(path)).status_code == 200
    await asyncio.sleep(0)
    assert recorded == []


async def test_real_uvicorn_signal_finishes_inflight_request(tmp_path):
    marker = tmp_path / "started"
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    code = """
import asyncio, os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
import uvicorn
from src.health import router, shutdown_readiness
@asynccontextmanager
async def lifespan(app):
    with shutdown_readiness(app):
        yield
app = FastAPI(lifespan=lifespan)
app.include_router(router)
@app.get('/slow')
async def slow():
    Path(os.environ['SLOW_MARKER']).write_text('started')
    await asyncio.sleep(0.5)
    return {'shutting_down': app.state.shutting_down}
uvicorn.run(app, host='127.0.0.1', port=int(os.environ['HEALTH_PORT']), timeout_graceful_shutdown=3)
"""
    process = subprocess.Popen(
        [sys.executable, "-c", code],
        env={**os.environ, "SLOW_MARKER": str(marker), "HEALTH_PORT": str(port)},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        async with AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=5) as client:
            deadline = time.monotonic() + 10
            while True:
                try:
                    if (await client.get("/health/live")).status_code == 200:
                        break
                except httpx.ConnectError:
                    pass
                assert process.poll() is None, "Uvicorn failed to start"
                assert time.monotonic() < deadline
                await asyncio.sleep(0.05)
            pending = asyncio.create_task(client.get("/slow"))
            while not marker.exists():
                assert time.monotonic() < deadline
                await asyncio.sleep(0.01)
            process.send_signal(signal.SIGTERM)
            response = await pending
            assert response.status_code == 200
            assert response.json() == {"shutting_down": True}
            await asyncio.to_thread(process.wait, timeout=5)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
