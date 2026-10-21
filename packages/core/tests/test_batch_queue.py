"""Tests for AsyncBatchQueue."""

import asyncio

import pytest
from rapidkit_core.batch_queue import AsyncBatchQueue


@pytest.mark.asyncio
async def test_bounded_queue_reports_retry_exhaustion():
    from rapidkit_core.batch_queue import AsyncBatchQueue

    attempts = []
    states = []

    async def failing(batch):
        attempts.append(tuple(batch))
        raise RuntimeError("database unavailable")

    queue = AsyncBatchQueue(
        handler=failing,
        batch_size=1,
        flush_interval=10,
        max_buffer_size=2,
        retry_delays=(0, 0, 0),
        on_state=lambda event, count: states.append((event, count)),
    )
    await queue.put("event-id")
    assert len(attempts) == 4
    assert ("failed", 1) in states
    assert attempts == [("event-id",)] * 4


@pytest.mark.asyncio
async def test_cancellation_during_retry_preserves_unflushed_batch():
    from rapidkit_core.batch_queue import AsyncBatchQueue

    retrying = asyncio.Event()
    persisted = []
    healthy = False

    async def handler(batch):
        if not healthy:
            retrying.set()
            raise RuntimeError("offline")
        persisted.extend(batch)

    queue = AsyncBatchQueue(handler=handler, batch_size=100, flush_interval=10, retry_delays=(60,))
    await queue.put("event")
    flush = asyncio.create_task(queue.flush())
    await retrying.wait()
    flush.cancel()
    with pytest.raises(asyncio.CancelledError):
        await flush
    healthy = True
    await queue.flush()
    assert persisted == ["event"]


@pytest.fixture
def collected():
    """Shared list to collect flushed batches."""
    return []


@pytest.fixture
def make_queue(collected):
    """Factory that creates a queue with a collecting handler."""

    def _make(batch_size: int = 3, flush_interval: float = 0.1):
        async def handler(batch: list[int]) -> None:
            collected.append(list(batch))

        return AsyncBatchQueue(handler=handler, batch_size=batch_size, flush_interval=flush_interval)

    return _make


@pytest.mark.asyncio
async def test_flush_on_batch_size(make_queue, collected):
    """Items are flushed when batch_size is reached."""
    queue = make_queue(batch_size=3, flush_interval=10.0)
    await queue.start()
    try:
        await queue.put(1)
        await queue.put(2)
        assert len(collected) == 0
        await queue.put(3)
        assert collected == [[1, 2, 3]]
    finally:
        await queue.shutdown()


@pytest.mark.asyncio
async def test_flush_on_interval(make_queue, collected):
    """Items are flushed after flush_interval even if batch is not full."""
    queue = make_queue(batch_size=100, flush_interval=0.05)
    await queue.start()
    try:
        await queue.put(1)
        await queue.put(2)
        assert len(collected) == 0
        await asyncio.sleep(0.15)
        assert collected == [[1, 2]]
    finally:
        await queue.shutdown()


@pytest.mark.asyncio
async def test_shutdown_flushes_remaining(make_queue, collected):
    """Shutdown flushes any remaining items."""
    queue = make_queue(batch_size=100, flush_interval=10.0)
    await queue.start()
    await queue.put(10)
    await queue.put(20)
    await queue.shutdown()
    assert collected == [[10, 20]]


@pytest.mark.asyncio
async def test_empty_shutdown(make_queue, collected):
    """Shutdown with no items does not call handler."""
    queue = make_queue()
    await queue.start()
    await queue.shutdown()
    assert collected == []


@pytest.mark.asyncio
async def test_handler_error_does_not_crash(collected):
    """Handler errors are caught and logged, queue continues."""
    call_count = 0

    async def bad_handler(batch: list[int]) -> None:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("boom")
        collected.append(list(batch))

    queue = AsyncBatchQueue(handler=bad_handler, batch_size=2, flush_interval=10.0)
    await queue.start()
    try:
        await queue.put(1)
        await queue.put(2)  # triggers flush → error
        assert len(collected) == 0
        await queue.put(3)
        await queue.put(4)  # triggers flush → success
        assert collected == [[3, 4]]
    finally:
        await queue.shutdown()
