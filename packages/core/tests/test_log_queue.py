"""The file pipeline bounds retained data and isolates slow IO from its callers."""

import os
import io
import json
import threading
import time
import weakref
from datetime import datetime, timezone
from types import SimpleNamespace

from rapidkit_core import runtime_state


class Message(str):
    def __new__(cls, text, *, low=True):
        message = super().__new__(cls, text)
        message.record = {
            "time": datetime.now(timezone.utc),
            "level": SimpleNamespace(no=20 if low else 40),
            "private": object(),
        }
        return message


class Destination:
    def __init__(self, *, blocked=False):
        self.entered, self.release = threading.Event(), threading.Event()
        if not blocked:
            self.release.set()
        self.rows, self.stopped = [], False

    def write(self, message):
        self.entered.set()
        self.release.wait(5)
        self.rows.append(message)

    def stop(self):
        self.stopped = True


def test_limits_include_inflight_and_snapshot_only_rendered_text_time(capsys):
    from rapidkit_core.log_queue import FileLogSink

    target = Destination(blocked=True)
    sink = FileLogSink((target, target))
    before = runtime_state._counters["file_log_dropped"]
    original = Message("one")
    sink.write(original)
    assert target.entered.wait(1)
    start = time.monotonic()
    for _ in range(300):
        sink.write(Message("two"))
    assert time.monotonic() - start < 0.4
    assert runtime_state._gauges["file_log_queue_records"] == 256
    assert runtime_state._gauges["file_log_queue_bytes"] == 256 * 3
    assert runtime_state._counters["file_log_dropped"] - before == 45
    assert '"reason_code":"queue_full"' in capsys.readouterr().err
    target.release.set()
    assert sink.complete()
    sink.stop()
    assert len(target.rows) == 256 and target.stopped
    assert target.rows[0] == original and target.rows[0].record == {"time": original.record["time"]}
    assert runtime_state._gauges["file_log_queue_records"] == 0
    assert runtime_state._gauges["log_blocked"] == 0
    assert '"event":"log.file.recovered"' in capsys.readouterr().err


def test_byte_limit_utf8_oversize_rejection_and_shared_channels():
    from rapidkit_core.log_queue import FileLogSink

    access, error = Destination(blocked=True), Destination()
    sink = FileLogSink((access, error))
    payload = "界" * (1024**2 // 3)
    sink.write(Message(payload))
    assert access.entered.wait(1)
    before = runtime_state._counters["file_log_dropped"]
    sink.write(Message("xx", low=False))
    sink.write(Message(payload + "界"))
    assert runtime_state._counters["file_log_dropped"] - before == 2
    assert runtime_state._gauges["file_log_queue_bytes"] == len(payload.encode())
    access.release.set()
    assert sink.complete()
    sink.write(Message("error", low=False))
    assert sink.complete()
    sink.stop()
    assert access.rows == [payload] and error.rows == ["error"]


def test_complete_and_stop_have_deadlines_and_never_close_blocked_file_on_caller():
    from rapidkit_core.log_queue import FileLogSink

    target = Destination(blocked=True)
    sink = FileLogSink((target, target))
    sink.write(Message("pending"))
    assert target.entered.wait(1)
    start = time.monotonic()
    assert not sink.complete(timeout=0.02)
    sink.stop()
    assert time.monotonic() - start < 1.4
    assert not target.stopped
    target.release.set()
    sink._thread.join(1)
    assert target.stopped


def test_failed_file_write_recovers_and_finished_snapshot_is_released():
    from rapidkit_core.log_queue import FileLogSink

    references = []

    class FailingDestination(Destination):
        def write(self, message):
            references.append(weakref.ref(message))
            if len(references) == 1:
                raise OSError("synthetic disk failure")

    target = FailingDestination()
    sink = FileLogSink((target, target))
    before = runtime_state._counters["file_log_dropped"]
    sink.write(Message("fails"))
    assert sink.complete()
    assert runtime_state._counters["file_log_dropped"] - before == 1
    assert runtime_state._gauges["log_blocked"] == 1
    sink.write(Message("recovers"))
    assert sink.complete()
    assert runtime_state._gauges["log_blocked"] == 0
    assert all(reference() is None for reference in references)
    assert ("log_file", "write", "error") in runtime_state._dependencies
    sink.stop()


def test_oversize_file_copy_does_not_truncate_stdout(tmp_path, monkeypatch):
    from rapidkit_core import log
    from rapidkit_core.config import settings

    output = io.StringIO()
    monkeypatch.setattr(log.sys, "stdout", output)
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", None)
    log.setup_logging()
    log.set_custom_logfile()
    before = runtime_state._counters["file_log_dropped"]
    text = "x" * (1024**2 + 1)
    try:
        log.logger.info(text)
        assert log.complete_logging()
        assert runtime_state._counters["file_log_dropped"] - before == 1
        assert json.loads(output.getvalue())["message"] == text
        assert not list(tmp_path.glob("*.log"))
        log.logger.info("restored")
        assert log.complete_logging()
        assert json.loads(next(tmp_path.glob("*.log")).read_text())["message"] == "restored"
    finally:
        for handler in log._owned_handlers:
            log.logger.remove(handler)
        log._owned_handlers.clear()


def test_prefork_rebind_does_not_wait_on_inherited_writer(tmp_path, monkeypatch):
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from rapidkit_core.log_budget import BudgetedFile

    entered, release = threading.Event(), threading.Event()
    original = BudgetedFile.write

    def blocked(self, message):
        entered.set()
        release.wait(5)
        original(self, message)

    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", 1024**2)
    monkeypatch.setattr(settings, "LOG_FILE_MIN_FREE_BYTES", 0)
    monkeypatch.setattr(settings, "LOG_FORMAT", "{message}")
    monkeypatch.setattr(BudgetedFile, "write", blocked)
    log.setup_logging(service="worker")
    log.set_custom_logfile()
    log.logger.info("parent")
    assert entered.wait(1)
    child = os.fork()
    if child == 0:
        try:
            monkeypatch.setattr(BudgetedFile, "write", original)
            log.setup_logging(service="worker")
            log.set_custom_logfile()
            log.logger.info("child")
            os._exit(0 if log.complete_logging() else 1)
        except BaseException:
            os._exit(2)
    try:
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            finished, status = os.waitpid(child, os.WNOHANG)
            if finished:
                assert os.waitstatus_to_exitcode(status) == 0
                break
            time.sleep(0.01)
        else:
            os.kill(child, 9)
            os.waitpid(child, 0)
            raise AssertionError("prefork child blocked on parent's file pipeline")
        assert "child" in next(tmp_path.glob(f"access.*.{child}.log")).read_text()
    finally:
        release.set()
        log.logger.remove()
        log._owned_handlers.clear()
