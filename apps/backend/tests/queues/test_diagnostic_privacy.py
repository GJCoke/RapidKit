import json
from types import SimpleNamespace
from unittest.mock import patch

from celery import Celery
from celery import Task as CeleryTask
from src import observability
from src.queues import signals
from src.queues.task import Task


def test_observer_stream_does_not_store_execution_values(monkeypatch):
    redis = SimpleNamespace(xadd=lambda key, data, **kw: sent.append(data))
    sent = []
    monkeypatch.setattr(signals, "_get_redis", lambda: redis)
    sender = SimpleNamespace(
        name="send_password_reset_email",
        _logs="private-stdout",
        request=SimpleNamespace(headers={}, hostname="worker", retries=0),
    )
    signals.on_task_prerun(sender, "task-1", (), {"reset_link": "private-link", "email": "private-email"})
    signals.on_task_postrun(sender, "task-1", {"token": "private-return"}, "SUCCESS")
    error = ValueError("private-error")
    signals.on_task_failure(sender, "task-1", error, None)
    assert "private-" not in json.dumps(sent)
    failure = json.loads(sent[-1]["data"])
    assert failure["exception"] == "ValueError"


def test_real_task_arguments_and_result_survive_but_stdout_and_repr_are_private():
    class PrivateTask(Task):
        name = "test.private"

        def run(self, value):
            print(value * 10000)
            return value

    PrivateTask.bind(Celery("privacy", broker="memory://"))
    task = PrivateTask()
    assert task("private-argument") == "private-argument"
    assert task._logs is None
    with patch.object(CeleryTask, "apply_async", return_value=SimpleNamespace(id="queued")) as parent:
        task.apply_async(args=("private-argument",))
    options = parent.call_args.kwargs
    assert options["args"] == ("private-argument",)
    assert "private" not in options["argsrepr"]
    assert "private" not in options["kwargsrepr"]


def test_sentry_untrusted_free_text_is_filtered():
    event = {
        "extra": {"custom": "private-extra"},
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": "private-exception",
                    "stacktrace": {"frames": [{"filename": "task.py", "context_line": "private-line"}]},
                }
            ]
        },
        "logentry": {"formatted": "private-log", "params": ["private-param"]},
        "breadcrumbs": {"values": [{"message": "private-breadcrumb", "data": {"detail": "private-data"}}]},
    }
    cleaned = observability.before_send(event, {})
    assert "private-" not in json.dumps(cleaned)
    assert cleaned["exception"]["values"][0]["type"] == "ValueError"


def test_task_detail_does_not_redisclose_historical_payloads():
    from plugin_worker.schemas import TaskResultSchema

    record = TaskResultSchema(
        task_id="task-1",
        task_name="test.task",
        args=["private-argument"],
        kwargs={"reset_link": "private-link"},
        result="private-result",
        logs="private-output",
        exception="private-error",
        traceback="private-trace",
    )
    assert "private-" not in record.model_dump_json()


def test_worker_inspection_does_not_redisclose_legacy_args():
    from plugin_worker.services import parse_task_info_list

    tasks = parse_task_info_list(
        [{"id": "task-1", "name": "test.task", "args": ["private-arg"], "kwargs": {"email": "private-email"}}]
    )
    assert "private-" not in tasks[0].model_dump_json()
