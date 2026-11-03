import json
import os
import subprocess
import sys
from multiprocessing import get_context
from pathlib import Path


def test_default_logging_imports_without_posix_file_lock_support():
    script = """import builtins
original = builtins.__import__
def portable_import(name, *args, **kwargs):
    if name == 'fcntl':
        raise ImportError('synthetic non-POSIX platform')
    return original(name, *args, **kwargs)
builtins.__import__ = portable_import
from rapidkit_core.log import setup_logging
setup_logging()
"""
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def _write(directory, number):
    from rapidkit_core.log_budget import BudgetedFile

    sink = BudgetedFile(Path(directory) / f"writer-{number}.log", root=Path(directory), limit=1000, min_free=0)
    for _ in range(100):
        sink.write("x" * 50)
    sink.stop()


def test_concurrent_writers_never_cross_shared_budget(tmp_path):

    context = get_context("fork")
    children = [context.Process(target=_write, args=(str(tmp_path), index)) for index in range(4)]
    for child in children:
        child.start()
    for child in children:
        child.join(5)
        assert child.exitcode == 0
    assert sum(path.stat().st_size for path in tmp_path.glob("*.log")) == 1000


def test_budget_recovers_and_write_failure_does_not_raise(tmp_path, capsys):
    from rapidkit_core.log_budget import BudgetedFile

    sink = BudgetedFile(tmp_path / "access.log", root=tmp_path, limit=10, min_free=0)
    sink.write("1234567890")
    sink.write("drop-me")
    sink.write("also-drop")
    assert (tmp_path / "access.log").read_text() == "1234567890"
    assert capsys.readouterr().err.count('"event":"log.file.degraded"') == 1
    sink.stop()
    (tmp_path / "access.log").unlink()
    sink.write("restored")
    assert (tmp_path / "access.log").read_text() == "restored"
    assert '"event":"log.file.recovered"' in capsys.readouterr().err
    sink.stop()
    invalid = BudgetedFile(tmp_path, root=tmp_path, limit=100, min_free=0)
    invalid.write("must-not-raise")


def test_runtime_fork_snapshot_does_not_inherit_parent_counters(tmp_path):
    from rapidkit_core import runtime_state

    runtime_state.start("worker", tmp_path)
    runtime_state.increment("task_event_publish_failed", 7)
    runtime_state.write_snapshot()
    child = os.fork()
    if child == 0:
        try:
            runtime_state.start("worker", tmp_path)
            runtime_state.increment("task_event_publish_failed", 2)
            runtime_state.write_snapshot()
        finally:
            os._exit(0)
    os.waitpid(child, 0)
    snapshots = [json.loads(path.read_text()) for path in tmp_path.glob("*.json")]
    assert sorted(item["counters"]["task_event_publish_failed"] for item in snapshots) == [2, 7]
    runtime_state.stop()


def test_loguru_budget_sink_keeps_json_and_rotation_without_business_exceptions(tmp_path, monkeypatch, capsys):
    from rapidkit_core import log
    from rapidkit_core.config import settings

    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", 4096)
    monkeypatch.setattr(settings, "LOG_FILE_MIN_FREE_BYTES", 0)
    monkeypatch.setattr(settings, "LOG_FILE_MAX_BYTES", 1200)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    try:
        for _ in range(30):
            log.logger.info("safe event {}", "x" * 300)
        log.complete_logging()
        paths = list(tmp_path.glob("*.log"))
        assert paths and sum(path.stat().st_size for path in paths) <= 4096
        for path in paths:
            for line in path.read_text().splitlines():
                assert json.loads(line)["schema_version"] == 1
        assert '"reason_code":"budget_exceeded"' in capsys.readouterr().err
    finally:
        log.logger.remove()


def test_budget_cannot_be_bypassed_by_outside_or_verification_paths(tmp_path):
    from rapidkit_core.log_budget import BudgetedFile

    root = tmp_path / "managed"
    root.mkdir()
    for path in (tmp_path / "outside.log", root / "verification/escaped.log"):
        sink = BudgetedFile(path, root=root, limit=100, min_free=0)
        sink.write("must remain managed")
        sink.stop()
        assert not path.exists()


def test_transient_lock_contention_retains_accepted_records_without_blocking_producer(tmp_path, capsys):
    import fcntl
    import threading
    import time
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from rapidkit_core import runtime_state
    from rapidkit_core.log_budget import BudgetedFile
    from rapidkit_core.log_queue import FileLogSink

    entered, finished = threading.Event(), threading.Event()

    class Target(BudgetedFile):
        def write(self, message):
            entered.set()
            super().write(message)
            finished.set()

    class Message(str):
        record = {"time": datetime(2026, 11, 3, tzinfo=UTC), "level": SimpleNamespace(no=20)}

    target = Target(tmp_path / "access.log", root=tmp_path, limit=1024**2, min_free=0)
    sink = FileLogSink((target, target))
    before = runtime_state._counters["file_log_dropped"]
    expected = [f"record-{number}\n" for number in range(64)]
    try:
        with (tmp_path / ".budget.lock").open("a") as held:
            fcntl.flock(held, fcntl.LOCK_EX)
            start = time.monotonic()
            for text in expected:
                sink.write(Message(text))
            assert time.monotonic() - start < 0.2
            assert entered.wait(1)
            assert not finished.wait(0.05), "the writer must retain the record while the budget lock is held"
            assert sink._pending == 64
            fcntl.flock(held, fcntl.LOCK_UN)
        assert sink.complete(timeout=2)
        assert (tmp_path / "access.log").read_text().splitlines(keepends=True) == expected
        assert runtime_state._counters["file_log_dropped"] == before
        assert '"reason_code":"lock_busy"' not in capsys.readouterr().err
    finally:
        sink.stop()


def _write_complete_batch(directory, number, barrier):
    from rapidkit_core.log_budget import BudgetedFile

    sink = BudgetedFile(Path(directory) / f"writer-{number}.log", root=Path(directory), limit=1024**2, min_free=0)
    barrier.wait(timeout=5)
    for record in range(100):
        sink.write(f"{number}:{record}\n")
    sink.stop()


def test_contending_processes_preserve_every_record_when_budget_is_sufficient(tmp_path):
    context = get_context("fork")
    barrier = context.Barrier(4)
    children = [
        context.Process(target=_write_complete_batch, args=(str(tmp_path), number, barrier)) for number in range(4)
    ]
    for child in children:
        child.start()
    for child in children:
        child.join(10)
        assert child.exitcode == 0
    for number in range(4):
        assert (tmp_path / f"writer-{number}.log").read_text().splitlines() == [
            f"{number}:{record}" for record in range(100)
        ]


def test_permanently_held_budget_lock_keeps_shutdown_and_memory_bounded(tmp_path):
    import fcntl
    import time
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from rapidkit_core.log_budget import BudgetedFile
    from rapidkit_core.log_queue import FileLogSink

    class Message(str):
        record = {"time": datetime(2026, 11, 3, tzinfo=UTC), "level": SimpleNamespace(no=20)}

    target = BudgetedFile(tmp_path / "access.log", root=tmp_path, limit=1024**2, min_free=0)
    sink = FileLogSink((target, target))
    stopped = False
    try:
        with (tmp_path / ".budget.lock").open("a") as held:
            fcntl.flock(held, fcntl.LOCK_EX)
            sink.write(Message("retained\n"))
            start = time.monotonic()
            assert not sink.complete(timeout=0.02)
            sink.stop()
            stopped = True
            assert time.monotonic() - start < 1.4
            assert sink._pending == 1 and sink._bytes == len("retained\n")
            fcntl.flock(held, fcntl.LOCK_UN)
        sink._thread.join(2)
        assert not sink._thread.is_alive()
        assert (tmp_path / "access.log").read_text() == "retained\n"
    finally:
        if not stopped:
            sink.stop()


def test_parent_unlocks_budget_even_when_forked_child_retains_descriptor(tmp_path, monkeypatch):
    import fcntl
    import threading

    from rapidkit_core.log_budget import BudgetedFile

    original = fcntl.flock
    descriptor = []
    entered, release = threading.Event(), threading.Event()

    def capture(file, operation):
        if operation & fcntl.LOCK_EX:
            descriptor.append(file.fileno())
        return original(file, operation)

    def rotation(message, file):
        entered.set()
        release.wait(3)
        return False

    monkeypatch.setattr(fcntl, "flock", capture)
    target = BudgetedFile(
        tmp_path / "parent.log",
        root=tmp_path,
        limit=1024**2,
        min_free=0,
        rotation=rotation,
        compression=lambda path: None,
    )
    writer = threading.Thread(target=target.write, args=("parent\n",))
    writer.start()
    assert entered.wait(1)
    retained = os.dup(descriptor[0])
    notify_read, notify_write = os.pipe()
    child = os.fork()
    if child == 0:
        os.close(notify_write)
        os.read(notify_read, 1)
        status = 0
        try:
            with (tmp_path / ".budget.lock").open("a") as lock:
                original(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                original(lock, fcntl.LOCK_UN)
        except BlockingIOError:
            status = 1
        finally:
            os.close(retained)
            os._exit(status)
    os.close(notify_read)
    os.close(retained)
    release.set()
    writer.join(2)
    os.write(notify_write, b"x")
    os.close(notify_write)
    _, status = os.waitpid(child, 0)
    target.stop()
    assert not writer.is_alive()
    assert os.waitstatus_to_exitcode(status) == 0, "the parent's explicit unlock must release inherited descriptors"
