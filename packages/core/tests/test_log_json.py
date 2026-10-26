"""Structured stdout and scoped request IDs remain useful outside HTTP."""

import asyncio
import json
from uuid import uuid4

import pytest
from rapidkit_core import log
from rapidkit_core.config import Config, settings
from rapidkit_core.environment import Environment
from rapidkit_core.log import logger, setup_logging
from rapidkit_core.nanoid import get_request_nanoid, request_id_scope


@pytest.mark.parametrize(
    "environment,expected", [("LOCAL", False), ("TESTING", False), ("STAGING", True), ("PRODUCTION", True)]
)
def test_json_default_follows_environment(environment, expected, monkeypatch):
    monkeypatch.delenv("LOG_JSON", raising=False)
    assert Config(_env_file=None, ENVIRONMENT=environment).LOG_JSON is expected
    assert Config(_env_file=None, ENVIRONMENT=environment, LOG_JSON=not expected).LOG_JSON is not expected
    monkeypatch.setenv("LOG_JSON", str(not expected))
    assert Config(_env_file=None, ENVIRONMENT=environment).LOG_JSON is not expected


def test_stdout_json_contains_context_and_exception(capsys, monkeypatch):
    monkeypatch.setattr(settings, "LOG_JSON", True)
    setup_logging()
    try:
        with request_id_scope("req-test"):
            try:
                local_secret = "never-in-traceback-locals"
                raise ValueError("boom")
            except ValueError:
                logger.bind(plugin="Test").exception("first line\nsecond line")
        raw = capsys.readouterr().out
        assert len(raw.splitlines()) == 1
        record = json.loads(raw)
        assert {"time", "level", "message", "plugin", "request_id", "logger", "exception"} <= record.keys()
        assert record["message"] == "first line\nsecond line"
        assert record["request_id"] == "req-test"
        assert record["plugin"] == "Test"
        assert "ValueError" in record["exception"]
        assert local_secret not in record["exception"]
    finally:
        logger.remove()


def test_text_mode_and_default_plugin(capsys, monkeypatch):
    monkeypatch.setattr(settings, "LOG_JSON", False)
    monkeypatch.setattr(settings, "LOG_FORMAT", "{extra[plugin]} {request_id} {message}")
    setup_logging()
    try:
        with request_id_scope("req-text"):
            logger.info("hello")
        assert capsys.readouterr().out == "Core req-text hello\n"
    finally:
        logger.remove()


@pytest.mark.asyncio
async def test_request_scopes_are_nested_and_concurrent_without_leaks():
    assert get_request_nanoid() == "-"
    with request_id_scope("outer"):
        with pytest.raises(ValueError), request_id_scope("inner"):
            assert get_request_nanoid() == "inner"
            raise ValueError
        assert get_request_nanoid() == "outer"

        async def read(value):
            with request_id_scope(value):
                await asyncio.sleep(0)
                return get_request_nanoid()

        assert await asyncio.gather(read("one"), read("two")) == ["one", "two"]
        assert get_request_nanoid() == "outer"
    assert get_request_nanoid() == "-"


def test_json_stdout_survives_task_print_capture(capsys, monkeypatch):
    import io
    from contextlib import redirect_stdout

    monkeypatch.setattr(settings, "LOG_JSON", True)
    setup_logging()
    task_prints = io.StringIO()
    try:
        with request_id_scope("req-worker"), redirect_stdout(task_prints):
            logger.info("worker remains observable")
            print("captured task output")
        assert json.loads(capsys.readouterr().out)["request_id"] == "req-worker"
        assert task_prints.getvalue() == "captured task output\n"
    finally:
        logger.remove()


@pytest.mark.parametrize("json_output", [False, True])
def test_deployed_file_tracebacks_do_not_include_local_secrets(tmp_path, monkeypatch, capsys, json_output):
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", json_output)
    secret = uuid4().hex

    def failure(password):
        raise RuntimeError("expected failure")

    setup_logging()
    log.set_custom_logfile()
    try:
        try:
            failure(secret)
        except RuntimeError:
            logger.exception("file privacy verification")
        logger.complete()
        contents = "\n".join(path.read_text() for path in tmp_path.rglob("*.log"))
        assert "RuntimeError: expected failure" in contents
        assert secret not in capsys.readouterr().out
        assert secret not in contents
    finally:
        logger.remove()


def test_rotated_logfiles_keep_instance_suffix_and_never_overwrite(tmp_path, monkeypatch):
    from datetime import datetime

    monkeypatch.setattr(log.timezone, "now", lambda: datetime(2026, 10, 26))
    workers = [tmp_path / "access.host.101.log", tmp_path / "access.host.102.log"]
    for active in workers:
        for content in ("first", "second"):
            rotated = active.with_name(f"{active.stem}.2026-10-26_00-00-00_000000.log")
            rotated.write_text(f"{active.name}:{content}")
            log.rename_rotated_logfile(str(rotated), active)

    assert {path.name: path.read_text() for path in tmp_path.iterdir()} == {
        "access.host.101.2026-10-26.log": "access.host.101.log:first",
        "access.host.101.2026-10-26.2.log": "access.host.101.log:second",
        "access.host.102.2026-10-26.log": "access.host.102.log:first",
        "access.host.102.2026-10-26.2.log": "access.host.102.log:second",
    }
    # Loguru retention only cleans files matching `<root>.*<ext>` of the active file.
    assert len(list(tmp_path.glob("access.host.101.*.log"))) == 2
