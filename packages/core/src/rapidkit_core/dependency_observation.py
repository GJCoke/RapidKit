"""Safe dependency timings; no arguments, endpoint or exception text crosses this boundary."""

import asyncio
import os
import time
from contextlib import contextmanager
from threading import Lock
from time import monotonic

from rapidkit_core import runtime_state
from rapidkit_core.config import settings
from rapidkit_core.log import logger

NOTICE_INTERVAL_SECONDS = 60
_notices: dict[tuple[str, str, str], tuple[int, float, float]] = {}
_notice_lock = Lock()


def _after_fork() -> None:
    global _notices, _notice_lock
    _notices, _notice_lock = {}, Lock()


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_after_fork)


def retryable(error: BaseException | None) -> bool:
    if error is None or isinstance(error, asyncio.CancelledError):
        return False
    names = {kind.__name__ for kind in type(error).__mro__}
    if names & {"TimeoutError", "ConnectionError", "ConnectionResetError", "SMTPServerDisconnected", "HTTPError"}:
        return True
    status = getattr(error, "smtp_code", None)
    if isinstance(status, int):
        return 400 <= status < 500
    if getattr(error, "code", None) in {"SlowDown", "InternalError", "ServiceUnavailable", "RequestTimeout"}:
        return True
    original = getattr(error, "orig", error)
    state = getattr(original, "sqlstate", None)
    return bool(getattr(error, "connection_invalidated", False)) or (
        isinstance(state, str) and (state.startswith("08") or state in {"40001", "40P01"})
    )


def record_dependency(component: str, operation: str, seconds: float, error: BaseException | None = None) -> None:
    outcome = "cancelled" if isinstance(error, asyncio.CancelledError) else "error" if error is not None else "success"
    runtime_state.observe_dependency(component, operation, seconds, outcome)
    slow = seconds * 1000 >= settings.DEPENDENCY_SLOW_THRESHOLD_MS and (component, operation) != ("redis", "wait")
    notice_count = recovered_count = None
    with _notice_lock:
        now = monotonic()
        failed_key = (component, operation, "failed")
        slow_key = (component, operation, "slow")
        if error is None:
            previous = _notices.get(failed_key)
            # A healthy SELECT between failing SELECTs is not a recovery.
            if previous is not None and now - previous[2] >= NOTICE_INTERVAL_SECONDS:
                recovered_count = _notices.pop(failed_key)[0]
            previous = _notices.get(slow_key)
            if not slow and previous is not None and now - previous[2] >= NOTICE_INTERVAL_SECONDS:
                _notices.pop(slow_key)
        if error is not None or slow:
            key = failed_key if error is not None else slow_key
            count, emitted, _ = _notices.get(key, (0, float("-inf"), now))
            if now - emitted >= NOTICE_INTERVAL_SECONDS:
                notice_count, emitted = count + 1, now
            _notices[key] = (count + 1, emitted, now)
    if notice_count is None and recovered_count is None:
        return
    bound = logger.bind(
        component=component,
        operation=operation,
        duration_ms=round(seconds * 1000, 3),
        outcome=outcome,
        retryable=retryable(error),
        exception_type=type(error).__name__ if error is not None else None,
    )
    if recovered_count is not None:
        bound.bind(event="dependency.recovered", observation_count=recovered_count).info(
            "Dependency operations recovered: {}.{} observations={}", component, operation, recovered_count
        )
    if notice_count is not None:
        bound.bind(
            event="dependency.failed" if error is not None else "dependency.slow", observation_count=notice_count
        ).warning(
            "Dependency operation {}: {}.{} observations={}",
            "failed" if error is not None else "slow",
            component,
            operation,
            notice_count,
        )


def finish_dependency(component: str, operation: str, started: float, error: BaseException | None = None) -> None:
    try:
        record_dependency(component, operation, max(0, time.perf_counter() - started), error)
    except Exception:
        # Diagnostics must not replace the caller's result, exception or cancellation.
        pass


@contextmanager
def observe_dependency(component: str, operation: str):
    if operation not in runtime_state.DEPENDENCY_OPERATIONS.get(component, ()):
        raise ValueError("Unknown dependency operation")
    started, error = time.perf_counter(), None
    try:
        yield
    except BaseException as exc:
        error = exc
        raise
    finally:
        finish_dependency(component, operation, started, error)
