"""Schedule diagnostic task execution tests."""

import json
from datetime import datetime

import pytest
from src.queues.app import app


@pytest.mark.parametrize("kwargs, label", [({}, "schedule-test"), ({"label": "every-30-seconds"}, "every-30-seconds")])
def test_schedule_test_reports_execution_and_captured_logs(monkeypatch, kwargs, label) -> None:
    # Exercise Celery's tracing path without requiring Redis or PostgreSQL.
    monkeypatch.setattr(app.conf, "result_backend", "cache+memory://")
    monkeypatch.setattr(app.conf, "task_ignore_result", True)
    monkeypatch.setattr("src.queues.signals._publish_event", lambda *args, **kwargs: None)
    app.loader.import_default_modules()
    task = app.tasks["schedule_test"]

    result = task.apply(kwargs=kwargs, task_id="schedule-test-execution", throw=True)

    assert result.successful()
    assert result.result["label"] == label
    assert result.result["task_id"] == result.id
    assert result.result["worker"]
    assert datetime.fromisoformat(result.result["executed_at"]).tzinfo is not None
    assert json.loads(task._logs) == result.result
    assert task.ignore_result is False
    assert not any(entry["task"] == task.name for entry in app.conf.beat_schedule.values())
