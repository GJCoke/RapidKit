"""Runtime retention stays scoped and rotation bounds each process's output."""

import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from rapidkit_core import log
from rapidkit_core.config import LogConfigMixin, settings


@pytest.fixture
def log_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    monkeypatch.setattr(log, "_last_log_cleanup", float("-inf"), raising=False)
    monkeypatch.setattr(settings, "LOG_ACCESS_FILENAME", "access.log")
    monkeypatch.setattr(settings, "LOG_ERROR_FILENAME", "error.log")
    return tmp_path


def aged_file(directory, name, days=8):
    path = directory / name
    path.write_text("preserve unless expired runtime output", encoding="utf-8")
    timestamp = time.time() - days * 86400
    os.utime(path, (timestamp, timestamp))
    return path


def test_cleanup_expires_dead_process_and_archived_logs_only(log_directory, monkeypatch):
    host = socket.gethostname()
    dead_pid = 999999999
    expired = [
        f"access.{host}.{dead_pid}.log",
        f"error.{host}.{dead_pid}.log",
        "access.remote.123.2026-01-01.log",
        "error.remote.123.2026-01-01.2.log",
        "access_2026-01-01.log",
        "error_2026-01-01.log",
    ]
    preserved = [
        f"access.{host}.{os.getpid()}.log",
        "error.remote.123.log",
        "admin-migration-check.log",
        "access.log",
        "access.notes.log",
        "access_important.log",
    ]
    for name in expired + preserved:
        aged_file(log_directory, name)
    aged_file(log_directory, f"access.{host}.{dead_pid}.2026-01-02.log", days=1)
    verification = log_directory / "verification"
    verification.mkdir()
    aged_file(verification, "access_2026-01-01.log")
    outside = aged_file(log_directory, "outside.txt")
    (log_directory / "error.remote.123.2026-01-02.log").symlink_to(outside)

    log.cleanup_logfiles(force=True)

    assert all(not (log_directory / name).exists() for name in expired)
    assert all((log_directory / name).exists() for name in preserved)
    assert (log_directory / f"access.{host}.{dead_pid}.2026-01-02.log").exists()
    assert (verification / "access_2026-01-01.log").exists()
    assert (log_directory / "error.remote.123.2026-01-02.log").is_symlink()
    assert outside.exists()


def test_cleanup_respects_custom_names_retention_and_hourly_throttle(log_directory, monkeypatch):
    monkeypatch.setattr(settings, "LOG_ACCESS_FILENAME", "requests.log")
    monkeypatch.setattr(settings, "LOG_FILE_RETENTION_DAYS", 2)
    monotonic = [100.0]
    monkeypatch.setattr(log.time, "monotonic", lambda: monotonic[0])
    expired = aged_file(log_directory, "requests.remote.123.2026-01-01.log", days=3)
    untouched = aged_file(log_directory, "access.remote.123.2026-01-01.log")
    log.cleanup_logfiles(force=True)
    assert not expired.exists()
    expired = aged_file(log_directory, expired.name, days=3)
    log.cleanup_logfiles()
    assert expired.exists()
    monotonic[0] += 3600
    log.cleanup_logfiles()
    assert not expired.exists()
    assert untouched.exists()


@pytest.mark.parametrize("failure", [FileNotFoundError, PermissionError])
def test_cleanup_tolerates_concurrent_deletion_and_permission_errors(log_directory, monkeypatch, capsys, failure):
    path = aged_file(log_directory, "error.remote.123.2026-01-01.log")
    unlink = Path.unlink

    def fail_one(self, *args, **kwargs):
        if self == path:
            raise failure("test cleanup race or access denial")
        return unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_one)
    log.cleanup_logfiles(force=True)
    if failure is PermissionError:
        assert "test cleanup race or access denial" in capsys.readouterr().err


def test_cleanup_keeps_process_when_liveness_check_is_denied(log_directory, monkeypatch):
    path = aged_file(log_directory, f"access.{socket.gethostname()}.999999999.log")

    def denied(*args):
        raise PermissionError("cannot inspect another user")

    monkeypatch.setattr(log.os, "kill", denied)
    log.cleanup_logfiles(force=True)
    assert path.exists()


@pytest.mark.parametrize("field", ["LOG_FILE_MAX_BYTES", "LOG_FILE_RETENTION_DAYS"])
def test_log_management_settings_require_positive_limits(field):
    defaults = LogConfigMixin(_env_file=None)
    assert defaults.LOG_FILE_MAX_BYTES == 100 * 1024 * 1024
    assert defaults.LOG_FILE_RETENTION_DAYS == 7
    for invalid in (0, -1):
        with pytest.raises(ValueError):
            LogConfigMixin(_env_file=None, **{field: invalid})


@pytest.mark.parametrize("enqueue", [False, True])
def test_file_sinks_rotate_on_utf8_size_and_midnight_and_cleanup_on_writes(log_directory, monkeypatch, enqueue):
    monkeypatch.setattr(settings, "LOG_FILE_MAX_BYTES", 20)
    monkeypatch.setattr(settings, "LOG_FORMAT", "{message}")
    expired = aged_file(log_directory, "access.remote.123.2026-01-01.log")
    clock = [100.0]
    monkeypatch.setattr(log.time, "monotonic", lambda: clock[0])
    log.setup_logging()
    try:
        log.set_custom_logfile(enqueue=enqueue)
        assert not expired.exists(), "startup must sweep old processes"
        today = datetime.fromtimestamp(time.time()).astimezone().replace(hour=23, minute=59, second=0)
        next_day = today + timedelta(days=1)
        writer = log.logger.patch(lambda record: record.update(time=today))
        # 13 UTF-8 bytes each; two records must not fit into a 20-byte file.
        writer.info("你好你好")
        writer.info("你好你好")
        log.logger.complete()
        access = log_directory / f"access.{socket.gethostname()}.{os.getpid()}.log"
        archive = access.with_name(f"{access.stem}.{today:%Y-%m-%d}.log")
        assert archive.read_text(encoding="utf-8") == "你好你好\n"
        assert access.read_text(encoding="utf-8") == "你好你好\n"
        # Midnight still rotates after a size rotation, even with a short record.
        writer = log.logger.patch(lambda record: record.update(time=next_day))
        writer.info("day")
        writer.warning("warning")
        writer.warning("warning")
        writer.warning("warning")
        log.logger.complete()
        assert access.read_text(encoding="utf-8") == "day\n"
        assert len(list(log_directory.glob(f"{access.stem}.*.log"))) == 2
        assert len(list(log_directory.glob(f"error.{socket.gethostname()}.{os.getpid()}.*.log"))) >= 1
        expired = aged_file(log_directory, expired.name)
        clock[0] += 3600
        writer.info("sweep")
        log.logger.complete()
        assert not expired.exists(), "long-running processes sweep without a restart"
        for path in log_directory.glob("*.log"):
            assert path.stat().st_size <= 20
    finally:
        log.logger.remove()


def test_oversized_record_is_preserved_without_empty_archives(log_directory, monkeypatch):
    monkeypatch.setattr(settings, "LOG_FILE_MAX_BYTES", 10)
    monkeypatch.setattr(settings, "LOG_FORMAT", "{message}")
    log.setup_logging()
    try:
        log.set_custom_logfile(enqueue=False)
        log.logger.info("完整保留超大日志")
        log.logger.info("next")
        access_files = list(log_directory.glob("access.*.log"))
        assert len(access_files) == 2
        assert sorted(path.read_text(encoding="utf-8") for path in access_files) == ["next\n", "完整保留超大日志\n"]
    finally:
        log.logger.remove()


def test_cleanup_does_not_mistake_dotted_local_hostname_for_an_archive(log_directory, monkeypatch):
    hostname = "worker.123.2026-01-01"
    monkeypatch.setattr(log.socket, "gethostname", lambda: hostname)
    path = aged_file(log_directory, f"error.{hostname}.{os.getpid()}.log")
    log.cleanup_logfiles(force=True)
    assert path.exists()


def test_cleanup_reaps_another_process_log_only_after_it_exits(log_directory):
    with subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE) as process:
        path = aged_file(log_directory, f"access.{socket.gethostname()}.{process.pid}.log")
        log.cleanup_logfiles(force=True)
        assert path.exists()
        process.terminate()
        process.wait(timeout=5)
    log.cleanup_logfiles(force=True)
    assert not path.exists()
