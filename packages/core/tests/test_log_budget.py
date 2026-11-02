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
        log.logger.complete()
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
