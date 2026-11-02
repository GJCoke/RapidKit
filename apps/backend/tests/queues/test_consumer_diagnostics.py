import io
import json
import sys
from types import SimpleNamespace

import pytest
import sentry_sdk
from celery import Celery, signals
from celery.worker.consumer.consumer import Consumer
from kombu.message import Message
from kombu.utils.imports import symbol_by_name
from rapidkit_core import log
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment
from sentry_sdk.integrations.loguru import LoguruIntegration
from sentry_sdk.transport import Transport
from src.observability import before_send
from src.queues.app import app as project_app


@pytest.fixture
def production_diagnostics(monkeypatch, tmp_path):
    output, events = io.StringIO(), []
    monkeypatch.setattr(sys, "stdout", output)
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(settings, "LOG_FILE_BUDGET_BYTES", None)
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)

    class MemoryTransport(Transport):
        def capture_envelope(self, envelope):
            if (event := envelope.get_event()) is not None:
                events.append(event)

    client = sentry_sdk.Client(
        dsn="https://public@example.invalid/1",
        transport=MemoryTransport,
        default_integrations=False,
        integrations=[LoguruIntegration()],
        before_send=before_send,
        send_default_pii=False,
        include_local_variables=False,
    )
    with sentry_sdk.isolation_scope() as scope:
        scope.set_client(client)
        log.setup_logging(service="worker")
        log.set_custom_logfile(enqueue=False)
        yield output, tmp_path, events
        log.complete_logging()
        for handler in log._owned_handlers:
            log.logger.remove(handler)
        log._owned_handlers.clear()
    client.close()


@pytest.mark.parametrize("case", ["unknown_task", "unknown_message", "invalid_task", "decode_error"])
def test_actual_consumer_protocol_errors_are_private_and_preserve_disposition(case, production_diagnostics):
    app = Celery("consumer-diagnostics", broker="memory://", backend="cache+memory://")
    consumer_class = symbol_by_name(project_app.conf.worker_consumer)
    assert issubclass(consumer_class, Consumer)
    consumer = consumer_class(
        on_task_request=lambda request: None,
        app=app,
        hostname="synthetic-worker",
        controller=SimpleNamespace(use_eventloop=False, semaphore=None),
    )
    rejected, unknown = [], []

    def on_rejected(**kwargs):
        rejected.append(True)

    def on_unknown(**kwargs):
        unknown.append(kwargs["id"])

    signals.task_rejected.connect(on_rejected, weak=False)
    signals.task_unknown.connect(on_unknown, weak=False)
    private = "synthetic-private-consumer-credential"
    exception_private = "synthetic-private-consumer-exception"
    try:
        with app.connection() as connection:
            message = Message(
                body=json.dumps([[private], {"reset_link": private}, {}]).encode(),
                content_type="application/json",
                content_encoding="utf-8",
                headers={"id": case, "task": "synthetic.missing", "argsrepr": "[Filtered]", "authorization": private},
                channel=connection.channel(),
                delivery_tag=case,
            )
            try:
                raise ValueError(exception_private)
            except ValueError as error:
                if case == "unknown_task":
                    consumer.on_unknown_task(message.payload, message, error)
                elif case == "unknown_message":
                    consumer.on_unknown_message(message.payload, message)
                elif case == "invalid_task":
                    consumer.on_invalid_task(message.payload, message, error)
                else:
                    consumer.on_decode_error(message, error)
            assert message._state == ("ACK" if case == "decode_error" else "REJECTED")
            assert rejected == ([True] if case in {"unknown_message", "invalid_task"} else [])
            assert unknown == ([case] if case == "unknown_task" else [])
            if case == "unknown_task":
                assert app.AsyncResult(case).state == "FAILURE"
            # A later non-consumer log must not inherit this message's metadata.
            log.logger.info("After consumer callback")
    finally:
        signals.task_rejected.disconnect(on_rejected)
        signals.task_unknown.disconnect(on_unknown)

    output, directory, events = production_diagnostics
    log.complete_logging()
    stdout = output.getvalue()
    files = "".join(path.read_text() for path in directory.glob("*.log"))
    assert private not in stdout + files + json.dumps(events)
    assert exception_private not in stdout + files + json.dumps(events)
    for text in (stdout, files):
        rows = [json.loads(line) for line in text.splitlines()]
        matching = [row for row in rows if row.get("event") == "task.message.rejected"]
        assert len(matching) == 1
        assert matching[0]["reason_code"] == case
        assert matching[0]["task_id"] == case and matching[0]["task_name"] == "synthetic.missing"
        if case != "unknown_message":
            assert "ValueError" in (matching[0]["exception"] or "")
        after = [row for row in rows if row["message"] == "After consumer callback"]
        assert len(after) == 1 and after[0].get("task_id") is None
    if case != "unknown_message":
        assert events, "the local SDK should still receive handled diagnostic errors"


@pytest.mark.parametrize(
    "headers", [{}, {"id": ["private"], "task": {"private": True}}, {"id": "x" * 101, "task": "y" * 256}]
)
def test_invalid_identifiers_are_omitted_without_reading_body(headers, production_diagnostics):
    consumer_class = symbol_by_name(project_app.conf.worker_consumer)
    app = Celery("bad-identifiers", broker="memory://")
    consumer = consumer_class(
        on_task_request=lambda request: None,
        app=app,
        controller=SimpleNamespace(use_eventloop=False, semaphore=None),
    )
    with app.connection() as connection:
        message = Message(body=b"private", headers=headers, channel=connection.channel())
        consumer.on_unknown_message(b"private", message)
        assert message._state == "REJECTED"
    row = json.loads(production_diagnostics[0].getvalue().splitlines()[-1])
    assert row["event"] == "task.message.rejected"
    assert row["task_id"] is None and row["task_name"] is None
