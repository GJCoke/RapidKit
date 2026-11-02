"""A bounded file-only channel; disk IO never runs in an online log producer."""

import json
import os
import sys
import threading
import time
from collections import deque
from typing import Any

from rapidkit_core import runtime_state

# Keep inherited file objects alive: finalizing them after fork could acquire an
# IO lock held by the vanished parent thread. Celery prefork children use os._exit.
_inherited_sinks: list["FileLogSink"] = []


class _FileMessage(str):
    record: dict[str, Any]


class FileLogSink:
    MAX_RECORDS = 256
    MAX_BYTES = 1024**2

    def __init__(self, targets, *, users=1):
        self._targets, self._users = targets, users
        self._pid = os.getpid()
        self._condition = threading.Condition()
        self._queue = deque()
        self._pending = self._bytes = 0
        self._stopping = False
        self._degraded = False
        self._queue_failed = False
        self._failed_targets: set[int] = set()
        self._last_warning = float("-inf")
        self._unconfirmed = False
        self._thread = threading.Thread(target=self._run, name="file-log-writer", daemon=True)
        self._thread.start()

    def _publish(self):
        runtime_state.set_gauge("file_log_queue_records", self._pending)
        runtime_state.set_gauge("file_log_queue_bytes", self._bytes)
        runtime_state.set_gauge("log_blocked", int(self._queue_failed or bool(self._failed_targets)))

    def _failure(self, reason, count=1):
        runtime_state.increment("file_log_dropped", count)
        self._degraded = True
        if time.monotonic() - self._last_warning >= 60:
            self._last_warning = time.monotonic()
            sys.stderr.write(
                json.dumps({"event": "log.file.degraded", "reason_code": reason}, separators=(",", ":")) + "\n"
            )

    def write(self, message):
        if self._pid != os.getpid():
            return
        size = len(message.encode("utf-8"))
        reason = None
        with self._condition:
            if self._stopping:
                reason = "stopping"
            elif size > self.MAX_BYTES:
                reason = "record_too_large"
            elif self._pending >= self.MAX_RECORDS or self._bytes + size > self.MAX_BYTES:
                reason = "queue_full"
            if reason:
                self._queue_failed = True
            else:
                snapshot = _FileMessage(message)
                snapshot.record = {"time": message.record["time"]}
                self._queue.append((snapshot, size, 0 if message.record["level"].no <= 25 else 1))
                self._pending += 1
                self._bytes += size
                self._condition.notify()
            self._publish()
        if reason:
            self._failure(reason)

    def _run(self):
        try:
            while True:
                with self._condition:
                    self._condition.wait_for(lambda: self._queue or self._stopping)
                    if not self._queue:
                        return
                    message, size, target_index = self._queue.popleft()
                target = self._targets[target_index]
                began = time.monotonic()
                failed = False
                try:
                    target.write(message)
                    failed = getattr(target, "_degraded", False)
                except Exception:
                    failed = True
                    self._failure("write_failed")
                runtime_state.observe_dependency(
                    "log_file", "write", time.monotonic() - began, "error" if failed else "success"
                )
                del message
                with self._condition:
                    if failed:
                        self._failed_targets.add(target_index)
                    else:
                        self._failed_targets.discard(target_index)
                    self._pending -= 1
                    self._bytes -= size
                    self._queue_failed = False
                    self._publish()
                    recovered = self._degraded and not self._failed_targets
                    if recovered:
                        self._degraded = False
                    self._condition.notify_all()
                if recovered:
                    sys.stderr.write('{"event":"log.file.recovered"}\n')
        finally:
            # Only the writer may close files; close/flush may themselves block.
            for target in self._targets:
                try:
                    target.stop()
                except Exception:
                    self._failure("close_failed")

    def _timeout(self):
        if not self._unconfirmed:
            self._unconfirmed = True
            self._queue_failed = True
            self._publish()
            return self._pending
        return None

    def complete(self, timeout=1.0):
        if self._pid != os.getpid():
            return False
        with self._condition:
            complete = self._condition.wait_for(lambda: self._pending == 0, timeout=max(0, timeout))
            unconfirmed = self._timeout() if not complete else None
        if unconfirmed is not None:
            self._failure("shutdown_timeout", unconfirmed)
        return complete

    def stop(self):
        if self._pid != os.getpid():
            if self not in _inherited_sinks:
                _inherited_sinks.append(self)
            return
        with self._condition:
            self._users -= 1
            if self._users > 0:
                return
            self._stopping = True
            self._condition.notify()
        self._thread.join(1)
        if self._thread.is_alive():
            with self._condition:
                unconfirmed = self._timeout()
            if unconfirmed is not None:
                self._failure("shutdown_timeout", unconfirmed)
