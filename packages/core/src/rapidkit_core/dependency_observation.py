"""Safe dependency timings; no arguments, endpoint or exception text crosses this boundary."""

import asyncio
import time
from contextlib import contextmanager

from rapidkit_core import runtime_state
from rapidkit_core.config import settings
from rapidkit_core.log import logger


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
    if error is None and not slow:
        return
    logger.bind(
        event="dependency.failed" if error is not None else "dependency.slow",
        component=component,
        operation=operation,
        duration_ms=round(seconds * 1000, 3),
        outcome=outcome,
        retryable=retryable(error),
        exception_type=type(error).__name__ if error is not None else None,
    ).warning("Dependency operation failed" if error is not None else "Dependency operation slow")


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
