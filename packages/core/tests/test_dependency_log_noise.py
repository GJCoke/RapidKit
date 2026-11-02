import io
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from rapidkit_core import dependency_observation as observation
from rapidkit_core import log, runtime_state
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment
from rapidkit_core.nanoid import request_id_scope


@pytest.fixture
def diagnostics(monkeypatch):
    clock, rows = [10.0], []
    monkeypatch.setattr(observation, "monotonic", lambda: clock[0], raising=False)
    monkeypatch.setattr(observation, "_notices", {}, raising=False)
    monkeypatch.setattr(runtime_state, "_dependencies", {})
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 500)
    output = io.StringIO()
    monkeypatch.setattr(log.sys, "stdout", output)
    log.setup_logging()
    handler = log.logger.add(lambda message: rows.append(json.loads(message.record["extra"]["_json"])))
    yield clock, rows, output
    log.logger.remove(handler)
    for owned in log._owned_handlers:
        log.logger.remove(owned)
    log._owned_handlers.clear()


def test_failure_storm_interleaved_with_success_keeps_metrics_summary_and_stable_recovery(diagnostics):
    clock, rows, _ = diagnostics
    for number in range(1000):
        with request_id_scope(f"request-{number}"), log.logger.contextualize(task_id=f"task-{number}"):
            observation.record_dependency("postgresql", "query.select", 0.001, ValueError("private-credential"))
            observation.record_dependency("postgresql", "query.select", 0.001)
    assert len(rows) == 1
    assert rows[0]["observation_count"] == 1
    assert "postgresql.query.select" in rows[0]["message"] and "observations=1" in rows[0]["message"]
    assert rows[0]["request_id"] == "request-0" and rows[0]["task_id"] == "task-0"
    assert len(observation._notices) == 1
    for outcome in ("success", "error"):
        assert runtime_state._dependencies[("postgresql", "query.select", outcome)][-2] == 1000
    clock[0] = 70
    observation.record_dependency("postgresql", "query.select", 0.001, ValueError("private-credential"))
    assert len(rows) == 2 and rows[-1]["observation_count"] == 1001
    clock[0] = 70.5
    observation.record_dependency("postgresql", "query.select", 0.001)
    assert len(rows) == 2
    clock[0] = 130
    observation.record_dependency("postgresql", "query.select", 0.001)
    observation.record_dependency("postgresql", "query.select", 0.001)
    assert [row["event"] for row in rows] == ["dependency.failed", "dependency.failed", "dependency.recovered"]
    assert rows[-1]["observation_count"] == 1001
    assert "private-credential" not in json.dumps(rows)


def test_slow_and_failed_operations_have_independent_bounded_windows(diagnostics):
    clock, rows, _ = diagnostics
    for _ in range(100):
        observation.record_dependency("redis", "get", 0.001, TimeoutError("private"))
        observation.record_dependency("redis", "set", 0.001, TimeoutError("private"))
        observation.record_dependency("redis", "get", 1)
        observation.record_dependency("redis", "get", 0.001)
    assert [(row["operation"], row["event"]) for row in rows] == [
        ("get", "dependency.failed"),
        ("set", "dependency.failed"),
        ("get", "dependency.slow"),
    ]
    clock[0] = 70
    observation.record_dependency("redis", "get", 1)
    assert rows[-1]["event"] == "dependency.slow" and rows[-1]["observation_count"] == 101
    assert len(observation._notices) <= 3


def test_concurrent_threads_do_not_each_emit_the_first_failure(diagnostics):
    _, rows, _ = diagnostics
    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda _: observation.record_dependency("redis", "get", 0.001, TimeoutError()), range(1000)))
    assert len(rows) == 1
    assert runtime_state._dependencies[("redis", "get", "error")][-2] == 1000


def test_prefork_resets_failure_window_and_parent_lock(diagnostics):
    _, rows, _ = diagnostics
    observation.record_dependency("redis", "get", 0.001, TimeoutError())
    with observation._notice_lock:
        child = os.fork()
    if child == 0:
        try:
            observation.record_dependency("redis", "get", 0.001, TimeoutError())
            os._exit(0 if len(rows) == 2 and rows[-1]["observation_count"] == 1 else 1)
        except BaseException:
            os._exit(2)
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
        pytest.fail("prefork dependency diagnostics retained the parent's locked state")


async def test_real_missing_column_remains_an_error_without_sql_or_warning_flood(diagnostics, monkeypatch):
    from rapidkit_core import database
    from sqlalchemy import text
    from sqlalchemy.exc import ProgrammingError

    _, rows, output = diagnostics
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.LOCAL)
    monkeypatch.setattr(database, "_async_engine_instance", None)
    engine = database.get_async_engine()
    try:
        async with engine.connect() as connection:
            for _ in range(100):
                with pytest.raises(ProgrammingError) as caught:
                    await connection.execute(text("SELECT synthetic_missing_column"))
                assert caught.value.orig.sqlstate == "42703"
                await connection.rollback()
                assert await connection.scalar(text("SELECT 1")) == 1
                await connection.rollback()
        assert len(rows) == 1 and rows[0]["event"] == "dependency.failed"
        assert rows[0]["exception_type"] == "ProgrammingError"
        assert "synthetic_missing_column" not in output.getvalue()
        assert "ROLLBACK" not in output.getvalue()
        for outcome in ("success", "error"):
            assert runtime_state._dependencies[("postgresql", "query.select", outcome)][-2] == 100
    finally:
        await engine.dispose()
