"""Infrastructure health check behavior tests."""

import asyncio
import threading

import pytest
from plugin_system import health
from plugin_system.schemas import ServiceHealth


@pytest.mark.asyncio
async def test_minio_check_does_not_block_event_loop(monkeypatch):
    """A slow synchronous MinIO SDK call must not block unrelated async work."""
    started = threading.Event()
    release = threading.Event()

    def blocking_check() -> ServiceHealth:
        started.set()
        release.wait(timeout=1)
        return ServiceHealth(status="healthy", latency_ms=1, details={"bucket_count": 0})

    monkeypatch.setattr(health, "_check_minio_sync", blocking_check, raising=False)

    task = asyncio.create_task(health.check_minio(timeout=1))
    try:
        for _ in range(20):
            if started.is_set():
                break
            await asyncio.sleep(0.01)
        assert started.is_set()
        assert not task.done()
    finally:
        release.set()

    result = await task
    assert result.status == "healthy"


@pytest.mark.asyncio
async def test_minio_check_timeout_returns_down(monkeypatch):
    """A stalled SDK call must produce a bounded unhealthy result."""
    release = threading.Event()

    def blocking_check() -> ServiceHealth:
        release.wait(timeout=1)
        return ServiceHealth(status="healthy", latency_ms=1, details={"bucket_count": 0})

    monkeypatch.setattr(health, "_check_minio_sync", blocking_check, raising=False)

    try:
        result = await health.check_minio(timeout=0.01)
    finally:
        release.set()

    assert result.status == "down"
    assert result.latency_ms == 0


@pytest.mark.asyncio
async def test_minio_check_returns_sync_result(monkeypatch):
    """Successful worker-thread checks preserve the service-health payload."""
    expected = ServiceHealth(status="healthy", latency_ms=2.5, details={"bucket_count": 3})
    monkeypatch.setattr(health, "_check_minio_sync", lambda: expected, raising=False)

    result = await health.check_minio(timeout=1)

    assert result == expected
