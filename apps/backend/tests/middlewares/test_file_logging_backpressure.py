"""Measure actual ASGI wall time while the file channel cannot make progress."""

import asyncio
import fcntl
import io
import threading
import time

import pytest
from rapidkit_core import log, runtime_state
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment
from rapidkit_core.log_budget import BudgetedFile
from src.middlewares.logger import LoggerMiddleware


@pytest.mark.parametrize("failure", ["budget_lock", "slow_write"])
async def test_file_backpressure_does_not_stall_requests_or_event_loop(tmp_path, monkeypatch, failure):
    monkeypatch.setattr(log.sys, "stdout", io.StringIO())
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", 10 * 1024**2)
    monkeypatch.setattr(settings, "LOG_FILE_MIN_FREE_BYTES", 0)
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    entered, release = threading.Event(), threading.Event()
    original = BudgetedFile.write

    def slow_write(self, message):
        if not entered.is_set():
            entered.set()
            release.wait(1.5)
        original(self, message)

    def hold_budget():
        with (tmp_path / ".budget.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            entered.set()
            release.wait(1.5)

    if failure == "slow_write":
        monkeypatch.setattr(BudgetedFile, "write", slow_write)
    log.setup_logging()
    log.set_custom_logfile()
    holder = None
    if failure == "budget_lock":
        holder = threading.Thread(target=hold_budget)
        holder.start()
    else:
        log.logger.info("Begin slow file operation")
    assert await asyncio.to_thread(entered.wait, 1)

    async def application(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b""}

    async def send(message):
        pass

    done, durations, lags = asyncio.Event(), [], []

    async def heartbeat():
        while not done.is_set():
            expected = time.monotonic() + 0.01
            await asyncio.sleep(0.01)
            lags.append(max(0, time.monotonic() - expected))

    ticker = asyncio.create_task(heartbeat())
    try:
        await asyncio.sleep(0)
        wrapped = LoggerMiddleware(application)
        for _ in range(400):
            start = time.monotonic()
            await wrapped(
                {"type": "http", "path": "/synthetic-pressure", "method": "GET", "headers": []}, receive, send
            )
            durations.append(time.monotonic() - start)
        await asyncio.sleep(0.03)
        assert max(durations) < 0.4
        assert max(lags) < 0.4
        assert runtime_state._gauges.get("file_log_queue_records", 0) <= 256
        assert runtime_state._gauges.get("file_log_queue_bytes", 0) <= 1024**2
    finally:
        done.set()
        release.set()
        await ticker
        if holder:
            holder.join(2)
        for handler in log._owned_handlers:
            log.logger.remove(handler)
        log._owned_handlers.clear()
