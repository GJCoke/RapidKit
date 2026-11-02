import json
import logging
from uuid import uuid4

from rapidkit_core import log
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment
from rapidkit_core.nanoid import request_id_scope


def test_structured_context_is_allowlisted_and_independent_of_stdout_level(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(settings, "LOG_LEVEL", "ERROR")
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    try:
        with request_id_scope("request-file"):
            log.logger.bind(event="http.request.completed", duration_ms=12, password="private").info("completed")
        log.logger.complete()
        output = "".join(path.read_text() for path in tmp_path.glob("access.*.log"))
        record = json.loads(output)
        assert record["request_id"] == "request-file"
        assert record["event"] == "http.request.completed"
        assert record["duration_ms"] == 12
        assert "private" not in output and "password" not in record
        assert not capsys.readouterr().out
    finally:
        log.logger.remove()


def test_production_exception_values_and_celery_returns_are_not_diagnostic_data(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    secret = uuid4().hex
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    try:
        try:
            raise ValueError(secret)
        except ValueError:
            log.logger.exception("operation failed: {}", secret)
        record = logging.LogRecord(
            "celery.app.trace",
            logging.INFO,
            __file__,
            1,
            "Task %(name)s returned %(return_value)s",
            {"name": "test.task", "id": "task-1", "return_value": secret},
            None,
        )
        log.InterceptHandler().emit(record)
        output = capsys.readouterr().out
        assert secret not in output
        events = [json.loads(line) for line in output.splitlines()]
        assert "ValueError" in events[0]["exception"]
        assert events[1]["task_id"] == "task-1"
        assert all(secret not in path.read_text() for path in tmp_path.glob("*.log"))
    finally:
        log.logger.remove()


def test_component_failure_is_rate_limited_and_recovery_is_visible(monkeypatch):
    messages = []
    handler = log.logger.add(lambda message: messages.append(message.record["extra"].copy()))
    try:
        monkeypatch.setattr(log, "_component_failures", {})
        monkeypatch.setattr(log.time, "monotonic", lambda: 10)
        log.component_failed("request_metrics", ValueError("private"))
        log.component_failed("request_metrics", ValueError("private"))
        log.component_recovered("request_metrics")
        events = [row for row in messages if row.get("component") == "request_metrics"]
        assert [row["event"] for row in events] == ["component.degraded", "component.recovered"]
        assert events[-1]["consecutive_failures"] == 2
    finally:
        log.logger.remove(handler)


def test_persistent_component_failures_keep_the_first_trace_and_later_summaries(monkeypatch):
    rows, clock = [], [10.0]
    monkeypatch.setattr(log, "_component_failures", {})
    monkeypatch.setattr(log.time, "monotonic", lambda: clock[0])
    handler = log.logger.add(lambda message: rows.append(message.record.copy()))
    try:
        log.component_failed("task_event_persistence", ValueError("synthetic-private-value"))
        log.component_failed("task_event_persistence", ValueError("synthetic-private-value"))
        clock[0] = 70
        log.component_failed("task_event_persistence", ValueError("synthetic-private-value"))
        assert len(rows) == 2
        assert rows[0]["exception"] is not None and rows[1]["exception"] is None
        assert rows[1]["extra"]["consecutive_failures"] == 3
        assert "task_event_persistence" in rows[1]["message"] and "failures=3" in rows[1]["message"]
    finally:
        log.logger.remove(handler)


def test_safe_exception_keeps_root_cause_types_without_values():
    from rapidkit_core.diagnostics import exception_summary

    try:
        try:
            raise ConnectionRefusedError("private-host")
        except ConnectionRefusedError as cause:
            raise RuntimeError("private-wrapper") from cause
    except RuntimeError as error:
        output = exception_summary(error)
    assert "ConnectionRefusedError" in output and "RuntimeError" in output
    assert "private-" not in output


def test_task_diagnostic_summary_is_bounded_in_utf8_bytes():
    from rapidkit_core.diagnostics import task_diagnostics

    data = {
        "task_name": "汉" * 10000,
        "hostname": "汉" * 10000,
        "exception_type": "E" * 10000,
        "traceback_frames": [{"filename": "汉" * 10000, "name": "汉" * 10000, "lineno": 1}] * 100,
    }
    safe = task_diagnostics(data)
    assert len(json.dumps(safe, ensure_ascii=False).encode()) <= 16384
    assert safe["diagnostic_truncated"] is True
