"""Serialize ordinary runtime file writes against a shared directory budget."""

import fcntl
import json
import os
import shutil
import stat
import sys
import time
from pathlib import Path

from rapidkit_core import runtime_state


class BudgetedFile:
    def __init__(
        self, path: Path, *, root: Path, limit: int, min_free: int, rotation=None, compression=None, reclaim=None
    ):
        self.path, self.root = path, root
        self.limit, self.min_free = limit, min_free
        self.rotation, self.compression = rotation, compression
        self.reclaim = reclaim
        self.file = None
        self._degraded = False
        self._last_warning = float("-inf")

    def _failure(self, reason: str) -> None:
        runtime_state.increment("file_log_dropped")
        runtime_state.set_gauge("log_blocked", 1)
        self._degraded = True
        if time.monotonic() - self._last_warning >= 60:
            self._last_warning = time.monotonic()
            sys.stderr.write(
                json.dumps({"event": "log.file.degraded", "reason_code": reason}, separators=(",", ":")) + "\n"
            )

    def write(self, message) -> None:
        try:
            try:
                relative = self.path.resolve().relative_to(self.root.resolve())
            except ValueError:
                self._failure("unsafe_path")
                return
            if "verification" in relative.parts:
                self._failure("unsafe_path")
                return
            self.root.mkdir(parents=True, exist_ok=True)
            with (self.root / ".budget.lock").open("a") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self._failure("lock_busy")
                    return
                used = 0
                for directory, subdirs, files in os.walk(self.root, followlinks=False):
                    subdirs[:] = [
                        name for name in subdirs if name != "verification" and not (Path(directory) / name).is_symlink()
                    ]
                    for name in files:
                        item = Path(directory) / name
                        metadata = item.stat(follow_symlinks=False)
                        if stat.S_ISREG(metadata.st_mode) and name != ".budget.lock":
                            used += metadata.st_size
                required = used + len(message.encode("utf-8")) - self.limit
                if required > 0 and self.reclaim is not None:
                    used -= self.reclaim(required)
                if used + len(message.encode("utf-8")) > self.limit:
                    self._failure("budget_exceeded")
                    return
                if shutil.disk_usage(self.root).free < self.min_free + len(message.encode("utf-8")):
                    self._failure("low_free_space")
                    return
                if self.path.is_symlink():
                    self._failure("unsafe_path")
                    return
                self.path.parent.mkdir(parents=True, exist_ok=True)
                if self.file is None:
                    self.file = self.path.open("a", encoding="utf-8")
                if self.rotation is not None and self.compression is not None and self.rotation(message, self.file):
                    self.file.close()
                    self.file = None
                    self.compression(str(self.path))
                    self.file = self.path.open("a", encoding="utf-8")
                self.file.write(message)
                self.file.flush()
                if self._degraded:
                    sys.stderr.write('{"event":"log.file.recovered"}\n')
                    self._degraded = False
                runtime_state.set_gauge("log_blocked", 0)
        except OSError:
            self._failure("write_failed")

    def flush(self) -> None:
        try:
            if self.file:
                self.file.flush()
        except OSError:
            self._failure("write_failed")

    def stop(self) -> None:
        try:
            if self.file:
                self.file.close()
        except OSError:
            self._failure("write_failed")
        finally:
            self.file = None
