"""Bounded, process-local operational evidence; independent of Redis and log storage."""

import asyncio
import json
import math
import os
import socket
import sys
import threading
import time
from pathlib import Path

ROLES = ("api", "worker", "beat", "migrate")
DEPENDENCY_OPERATIONS = {
    "postgresql": ("pool.acquire", "query.select", "query.insert", "query.update", "query.delete", "query.other"),
    "redis": (
        "get",
        "set",
        "hash",
        "list",
        "set_members",
        "sorted_set",
        "stream",
        "script",
        "pipeline",
        "wait",
        "other",
    ),
    "minio": ("http.get", "http.head", "http.put", "http.post", "http.delete", "http.other", "upload"),
    "smtp": ("send",),
}
DEPENDENCY_BUCKETS = (0.005, 0.025, 0.1, 0.25, 0.5, 1, 3, 10, float("inf"))
COMPONENTS = (
    "request_metrics",
    "task_event_consumer",
    "task_event_persistence",
    "worker_offline_checker",
    "audit_delivery",
    "socket_renewal",
)
COUNTERS = frozenset(
    (
        "task_event_published",
        "task_event_publish_failed",
        "task_event_gaps",
        "request_metrics_dropped",
        "file_log_dropped",
        "audit_fallback_enqueued",
        *("component_failures:" + key for key in COMPONENTS),
    )
)
GAUGES = frozenset(
    (
        "audit_fallback",
        "log_blocked",
        *("component_degraded:" + key for key in COMPONENTS),
        *("background_running:" + key for key in COMPONENTS),
    )
)
_directory: Path | None = None
_role = "api"
_counters: dict[str, float] = dict.fromkeys(COUNTERS, 0)
_gauges: dict[str, float] = {}
_dependencies: dict[tuple[str, str, str], list[float]] = {}
_lock = threading.Lock()
_stop = threading.Event()
_thread: threading.Thread | None = None


def _after_fork() -> None:
    global _lock, _counters, _gauges, _dependencies, _stop, _thread
    _lock, _stop, _thread = threading.Lock(), threading.Event(), None
    _counters = dict.fromkeys(COUNTERS, 0.0)
    _gauges = {}
    _dependencies = {}


def observe_dependency(component: str, operation: str, seconds: float, outcome: str) -> None:
    if operation not in DEPENDENCY_OPERATIONS.get(component, ()) or outcome not in ("success", "error", "cancelled"):
        raise ValueError("Unknown dependency observation")
    if not math.isfinite(seconds) or seconds < 0:
        return
    with _lock:
        values = _dependencies.setdefault((component, operation, outcome), [0.0] * (len(DEPENDENCY_BUCKETS) + 1))
        for index, bound in enumerate(DEPENDENCY_BUCKETS):
            if seconds <= bound:
                values[index] += 1
        values[-1] += seconds


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_after_fork)


def increment(name: str, value: float = 1) -> None:
    if name in COUNTERS and value >= 0:
        with _lock:
            _counters[name] = _counters.get(name, 0) + value


def set_gauge(name: str, value: float) -> None:
    if name in GAUGES:
        with _lock:
            _gauges[name] = value


def write_snapshot() -> None:
    if _directory is None:
        return
    with _lock:
        data = {
            "version": 1,
            "role": _role,
            "pid": os.getpid(),
            "hostname": socket.gethostname(),
            "updated_at": time.time(),
            "counters": dict(_counters),
            "gauges": dict(_gauges),
            "dependencies": [
                {"component": component, "operation": operation, "outcome": outcome, "values": values}
                for (component, operation, outcome), values in _dependencies.items()
            ],
        }
        path = _directory / f"{os.getpid()}.json"
        temporary = path.with_suffix(f".{threading.get_ident()}.tmp")
        try:
            _directory.mkdir(parents=True, exist_ok=True)
            temporary.write_text(json.dumps(data), encoding="utf-8")
            temporary.replace(path)
        except OSError:
            sys.stderr.write('{"event":"runtime.snapshot.failed","reason_code":"storage_unavailable"}\n')


def start(role: str, directory: Path | None) -> None:
    global _directory, _role, _thread, _stop
    if directory is None or role not in ROLES:
        return
    _directory, _role = directory, role
    if _thread is not None and _thread.is_alive():
        return
    _stop = threading.Event()

    def heartbeat():
        while not _stop.is_set():
            write_snapshot()
            _stop.wait(5)

    write_snapshot()
    _thread = threading.Thread(target=heartbeat, daemon=True, name="runtime-state")
    _thread.start()


def stop() -> None:
    global _thread, _directory
    _stop.set()
    if _thread:
        _thread.join(1)
    _thread, _directory = None, None


def watch(task: asyncio.Task, component: str) -> None:
    set_gauge("background_running:" + component, 1)

    def completed(finished: asyncio.Task):
        set_gauge("background_running:" + component, 0)
        if not finished.cancelled() and (error := finished.exception()) is not None:
            # The logging module itself imports this module during initialization.
            from rapidkit_core.log import component_failed

            component_failed(component, error)
        write_snapshot()

    task.add_done_callback(completed)
