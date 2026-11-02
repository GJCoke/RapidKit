"""Development entry points group launches without sharing rotating files."""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from rapidkit_core import log
from rapidkit_core.config import Config, settings
from rapidkit_core.environment import Environment
from rapidkit_core.log_session import DevLogSession


@pytest.fixture
def local_logs(tmp_path, monkeypatch):
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.LOCAL)
    monkeypatch.setattr(settings, "LOG_FORMAT", "{message}")
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", 200 * 1024**2)
    monkeypatch.setattr(settings, "LOG_FILE_RETENTION_DAYS", 3)
    monkeypatch.setattr(settings, "LOG_ACCESS_FILENAME", "access.log")
    monkeypatch.setattr(settings, "LOG_ERROR_FILENAME", "error.log")
    for role in ("api", "worker", "beat"):
        monkeypatch.delenv(f"RAPIDKIT_LOG_SESSION_{role.upper()}", raising=False)
    yield tmp_path
    log.logger.remove()


def ended_session(root, name, *, days=0, host=None, pid=999999999):
    path = root / "dev" / "api" / name
    path.mkdir(parents=True)
    (path / ".session.json").write_text(json.dumps({"hostname": host or socket.gethostname(), "owner_pid": pid}))
    (path / "access.log").write_text("historical log")
    timestamp = time.time() - days * 86400
    for file in path.iterdir():
        os.utime(file, (timestamp, timestamp))
    return path


def test_environment_defaults_and_explicit_overrides(monkeypatch):
    fields = {"ENVIRONMENT", "LOG_FILE_MAX_BYTES", "LOG_FILE_BUDGET_BYTES", "LOG_FILE_RETENTION_DAYS"}
    for field in fields:
        monkeypatch.delenv(field, raising=False)
    values = settings.model_dump(exclude=fields)
    local = Config(_env_file=None, **values, ENVIRONMENT="LOCAL")
    assert (local.LOG_FILE_MAX_BYTES, local.LOG_FILE_BUDGET_BYTES, local.LOG_FILE_RETENTION_DAYS) == (
        20 * 1024**2,
        200 * 1024**2,
        3,
    )
    deployed = Config(_env_file=None, **values, ENVIRONMENT="PRODUCTION")
    assert (deployed.LOG_FILE_MAX_BYTES, deployed.LOG_FILE_BUDGET_BYTES, deployed.LOG_FILE_RETENTION_DAYS) == (
        100 * 1024**2,
        None,
        7,
    )
    custom = Config(
        _env_file=None,
        **values,
        ENVIRONMENT="LOCAL",
        LOG_FILE_MAX_BYTES=123,
        LOG_FILE_BUDGET_BYTES=456,
        LOG_FILE_RETENTION_DAYS=5,
    )
    assert (custom.LOG_FILE_MAX_BYTES, custom.LOG_FILE_BUDGET_BYTES, custom.LOG_FILE_RETENTION_DAYS) == (123, 456, 5)


def test_current_groups_roles_and_preserves_custom_names(local_logs, monkeypatch):
    monkeypatch.setattr(settings, "LOG_ACCESS_FILENAME", "http/requests.txt")
    for role in ("api", "worker", "beat"):
        log.setup_logging(service=role)
        log.set_custom_logfile()
        log.logger.info("{} launch", role)
        assert log.complete_logging()
        current = local_logs / "dev" / role / "current"
        assert current.is_symlink()
        files = list((current / "http").glob("requests.*.txt"))
        assert len(files) == 1
        assert files[0].read_text() == f"{role} launch\n"
    assert not list(local_logs.glob("*.log"))


def test_parent_and_prefork_children_share_session_and_keep_current(local_logs):
    session = DevLogSession(local_logs, "worker")
    other = local_logs / "dev" / "worker" / "newer"
    other.mkdir()
    current = other.parent / "current"
    current.unlink()
    current.symlink_to(other.name)
    child = os.fork()
    if child == 0:
        try:
            child_session = DevLogSession(local_logs, "worker")
            log.setup_logging(service="worker")
            log.set_custom_logfile(enqueue=False)
            log.logger.info("child")
            log.logger.remove()
            os._exit(0 if child_session.path == session.path else 2)
        except BaseException:
            os._exit(3)
    _, status = os.waitpid(child, 0)
    assert os.waitstatus_to_exitcode(status) == 0
    assert current.resolve() == other
    assert list(session.path.glob(f"access.*.{child}.log"))


def test_reload_supervisor_identity_survives_spawned_child_restarts(local_logs):
    # Python spawn is the same parent relation Uvicorn uses for --reload.
    program = """
import multiprocessing, sys
from pathlib import Path
from rapidkit_core.log_session import DevLogSession
def child(root):
    print(DevLogSession(Path(root), "api").path.name, flush=True)
if __name__ == "__main__":
    ctx = multiprocessing.get_context("spawn")
    for _ in range(3):
        p = ctx.Process(target=child, args=(sys.argv[1],))
        p.start(); p.join(10)
        assert p.exitcode == 0
"""
    script = local_logs / "reload.py"
    script.write_text(program)
    result = subprocess.run([sys.executable, str(script), str(local_logs)], capture_output=True, text=True, timeout=40)
    assert result.returncode == 0, result.stderr
    assert len(set(result.stdout.splitlines())) == 1
    assert len(list((local_logs / "dev" / "api").glob("*/.session.json"))) == 2  # directory + current link


def test_retention_archives_only_dead_sessions_and_keeps_three_recent(local_logs):
    old = ended_session(local_logs, "expired", days=4)
    history = [ended_session(local_logs, f"history-{n}", days=n / 10) for n in range(5)]
    live = ended_session(local_logs, "live", days=10, pid=os.getpid())
    remote = ended_session(local_logs, "remote", days=10, host="another-host")
    unknown = local_logs / "dev" / "api" / "unknown"
    unknown.mkdir()
    (unknown / ".session.json").write_text("broken metadata")
    verification = local_logs / "verification"
    verification.mkdir()
    (verification / "old.log").write_text("keep")
    session = DevLogSession(local_logs, "api")
    session.cleanup(force=True)
    archive = local_logs / "dev" / "archive" / "api"
    assert {p.name for p in archive.iterdir()} == {p.name for p in history[:3]}
    assert not old.exists()
    assert live.exists() and remote.exists() and unknown.exists()
    assert (verification / "old.log").read_text() == "keep"


def test_unknown_pid_liveness_preserves_session(local_logs, monkeypatch):
    protected = ended_session(local_logs, "permission-denied", days=10)

    def denied(*args):
        raise PermissionError("liveness unavailable")

    monkeypatch.setattr(os, "kill", denied)
    DevLogSession(local_logs, "api").cleanup(force=True)
    assert protected.exists()


def test_budget_reclaims_closed_logs_and_preserves_active_and_verification(local_logs, monkeypatch):
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", 512)
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    session = (local_logs / "dev" / "api" / "current").resolve()
    host = socket.gethostname()
    active = session / f"access.{host}.{os.getpid()}.log"
    active.write_text("active\n")
    rotated = session / f"access.{host}.{os.getpid()}.2026-11-01.log"
    rotated.write_text("x" * 600)
    dead = session / f"error.{host}.999999999.log"
    dead.write_text("x" * 600)
    verification = local_logs / "verification"
    verification.mkdir()
    (verification / "large.log").write_text("x" * 1000)
    log.logger.info("after reclaim")
    assert "after reclaim" in active.read_text()
    assert "active" in active.read_text()
    assert not rotated.exists() and not dead.exists()
    assert (verification / "large.log").stat().st_size == 1000


def test_budget_protects_live_files_and_reports_loss(local_logs, monkeypatch, capsys):
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", 512)
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    session = (local_logs / "dev" / "api" / "current").resolve()
    active = session / f"access.{socket.gethostname()}.{os.getpid()}.log"
    active.write_text("active" * 100)
    log.logger.info("file copy cannot fit")
    assert active.read_text() == "active" * 100
    captured = capsys.readouterr()
    assert "file copy cannot fit" in captured.out
    assert '"reason_code":"budget_exceeded"' in captured.err


def test_budget_reclaims_ended_history_before_live_session_archives(local_logs):
    ended_session(local_logs, "history")
    session = DevLogSession(local_logs, "api")
    session.cleanup(force=True)
    rotated = session.path / f"access.{socket.gethostname()}.{os.getpid()}.2026-11-01.log"
    rotated.write_text("recent active session archive")
    assert session.reclaim(1) > 0
    assert not (local_logs / "dev" / "archive" / "api" / "history").exists()
    assert rotated.exists()


def test_run_dev_script_exports_one_launch_identity(tmp_path):
    root = Path(__file__).resolve().parents[3]
    stub = tmp_path / "uv"
    stub.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$RAPIDKIT_LOG_SESSION_API" "$@"\n')
    stub.chmod(0o755)
    env = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}"}
    values = []
    for _ in range(2):
        result = subprocess.run(
            ["bash", str(root / "apps/backend/scripts/run-dev.sh")],
            cwd=tmp_path,
            env=env,
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 0, result.stderr
        lines = result.stdout.splitlines()
        values.append(lines[0])
        assert "--reload" in lines
        assert "src.main:asgi_app" in lines
    assert values[0] != values[1]


def test_cleanup_never_follows_archive_or_custom_directory_symlinks(local_logs):
    session = DevLogSession(local_logs, "api")
    outside = local_logs / "verification"
    protected = ended_session(outside, "preserve", days=10)
    (session.root / "archive").symlink_to(outside / "dev")
    session.cleanup(force=True)
    session.reclaim(100000)
    assert protected.exists()


def test_current_is_not_left_dangling_when_its_ended_session_expires(local_logs):
    old = ended_session(local_logs, "old", days=4)
    current = old.parent / "current"
    current.symlink_to(old.name)
    # A different service performs housekeeping while API is stopped.
    DevLogSession(local_logs, "worker").cleanup(force=True)
    assert not current.is_symlink() or current.exists()


def test_orphaned_live_child_protects_ended_parent_session(local_logs):
    path = ended_session(local_logs, "parent-exited", days=10)
    session = DevLogSession(local_logs, "worker")
    with subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE) as child:
        marker = path / f".pid-{child.pid}"
        marker.touch()
        old = time.time() - 10 * 86400
        os.utime(marker, (old, old))
        session.cleanup(force=True)
        assert path.exists()
        child.terminate()
        child.wait(timeout=5)
    session.cleanup(force=True)
    assert not path.exists()
