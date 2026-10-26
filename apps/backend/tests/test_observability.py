"""Optional Sentry initialization and a strict privacy boundary."""

import json
from unittest.mock import patch

import pytest
from rapidkit_core.config import SentryConfigMixin, settings
from rapidkit_core.nanoid import request_id_scope
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from src import observability


def test_no_dsn_does_not_initialize(monkeypatch):
    monkeypatch.setattr(settings, "SENTRY_DSN", None)
    with patch("sentry_sdk.init") as initialize:
        observability.init_sentry()
        initialize.assert_not_called()


def test_sentry_defaults_and_sampling_validation():
    values = dict(_env_file=None)
    assert SentryConfigMixin(**values).SENTRY_ERROR_SAMPLE_RATE == 1.0
    assert SentryConfigMixin(**values).SENTRY_TRACES_SAMPLE_RATE == 0.0
    for field in ("SENTRY_ERROR_SAMPLE_RATE", "SENTRY_TRACES_SAMPLE_RATE"):
        for value in (-0.1, 1.1):
            with pytest.raises(ValueError):
                SentryConfigMixin(**values, **{field: value})


def test_sentry_is_initialized_once_per_process_and_after_fork(monkeypatch):
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://public@example.invalid/1")
    monkeypatch.setattr(settings, "SENTRY_RELEASE", "rapidkit-test-release")
    monkeypatch.setattr(observability, "_initialized_pid", None)
    pid = [100]
    monkeypatch.setattr(observability.os, "getpid", lambda: pid[0])
    with patch("sentry_sdk.init") as initialize:
        observability.init_sentry()
        observability.init_sentry()
        assert initialize.call_count == 1
        options = initialize.call_args.kwargs
        assert options["send_default_pii"] is False
        assert options["include_local_variables"] is False
        assert options["sample_rate"] == 1.0 and options["traces_sample_rate"] == 0.0
        assert options["release"] == "rapidkit-test-release"
        assert {type(integration).__name__ for integration in options["integrations"]} >= {
            "FastApiIntegration",
            "CeleryIntegration",
            "LoguruIntegration",
        }
        pid[0] = 101
        observability.init_sentry()
        assert initialize.call_count == 2


def test_sentry_privacy_scrub_uses_only_trusted_context():
    event = {
        "request": {
            "url": "https://example.test/reset?token=private-query",
            "query_string": "token=private-query",
            "data": {"password": "private-body"},
            "cookies": {"session": "private-cookie"},
            "headers": {"Authorization": "Bearer private-auth", "X-Refresh-Token": "private-refresh"},
        },
        "user": {"id": "untrusted", "username": "private-name", "email": "private-email", "ip_address": "private-ip"},
        "contexts": {"trace": {"data": {"http.url": "https://example.test/reset?token=private-trace"}}},
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": "broken",
                    "stacktrace": {"frames": [{"vars": {"password": "private-local"}}]},
                }
            ]
        },
    }
    with identity_scope(IdentityMetadata("trusted-user", "trusted-user")), request_id_scope("req-sentry"):
        sanitized = observability.before_send(event, {})
    assert sanitized["user"] == {"id": "trusted-user"}
    assert sanitized["tags"]["request_id"] == "req-sentry"
    assert "private-" not in json.dumps(sanitized)
    assert sanitized["request"]["url"] == "https://example.test/reset"
    assert observability.before_send({"user": {"username": "unexpected"}}, {}).get("user") is None


@pytest.fixture
def sentry_events():
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.loguru import LoguruIntegration
    from sentry_sdk.transport import Transport

    events = []

    class MemoryTransport(Transport):
        def capture_envelope(self, envelope):
            event = envelope.get_event()
            if event is not None:
                events.append(event)

    client = sentry_sdk.Client(
        dsn="https://public@example.invalid/1",
        transport=MemoryTransport,
        send_default_pii=False,
        include_local_variables=False,
        before_send=observability.before_send,
        environment="TESTING",
        release="test-release",
        integrations=[FastApiIntegration(), CeleryIntegration(), LoguruIntegration()],
    )
    with sentry_sdk.isolation_scope() as scope:
        scope.set_client(client)
        yield events
    client.close()


def test_memory_transport_receives_private_http_exception_and_trusted_ids(sentry_events):
    from types import SimpleNamespace
    from uuid import uuid4

    from starlette.requests import Request

    secret = "sensitive-" + uuid4().hex
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/reset",
        "headers": [],
        "query_string": ("token=" + secret).encode(),
        "state": {"auth": SimpleNamespace(subject_user_id="trusted-http-user")},
    }
    request = Request(scope)
    with request_id_scope("req-http"):
        with pytest.raises(ValueError), observability.sentry_scope(request):
            raise ValueError("http failed")
    event = sentry_events[-1]
    assert event["tags"]["request_id"] == "req-http"
    assert event["user"] == {"id": "trusted-http-user"}
    assert event["environment"] == "TESTING" and event["release"] == "test-release"
    assert secret not in json.dumps(event)


def test_task_exception_is_captured_before_context_reset_without_user_leak(sentry_events):
    import sentry_sdk
    from celery import Celery
    from src.queues.task import Task

    class FailingTask(Task):
        name = "test.sentry-error"

        def run(self):
            raise ValueError("task failed")

    FailingTask.bind(Celery("sentry-task-test", broker="memory://"))
    task = FailingTask()
    task.push_request(headers={"request_id": "req-task", "user_id": "trusted-task-user"})
    try:
        with pytest.raises(ValueError):
            task()
    finally:
        task.pop_request()
    assert sentry_events[-1]["tags"]["request_id"] == "req-task"
    assert sentry_events[-1]["user"] == {"id": "trusted-task-user"}
    sentry_sdk.capture_message("unrelated event")
    assert sentry_events[-1].get("user") is None
    assert sentry_events[-1]["tags"]["request_id"] == "-"


def test_loguru_reporting_survives_reconfiguring_logging(sentry_events):
    from rapidkit_core.log import logger, setup_logging

    setup_logging()
    with request_id_scope("req-loguru"):
        logger.error("Sentry must survive logging reconfiguration")
    assert any(event.get("tags", {}).get("request_id") == "req-loguru" for event in sentry_events)


@pytest.mark.asyncio
async def test_sentry_api_worker_beat_initialization(loaded_app, monkeypatch):
    from src import main
    from src.queues import app as queue_module

    events = []
    monkeypatch.setattr(settings, "ENABLE_CELERY_MONITOR", False)
    monkeypatch.setattr(main, "setup_logging_config", lambda: events.append("logging"))
    monkeypatch.setattr(main, "init_sentry", lambda: events.append("sentry"))
    main.create_app()
    assert events[:2] == ["logging", "sentry"]
    events.clear()
    monkeypatch.setattr("rapidkit_core.log.setup_logging", lambda: events.append("logging"))
    monkeypatch.setattr("rapidkit_core.log.set_custom_logfile", lambda **kwargs: events.append(kwargs))
    monkeypatch.setattr(queue_module, "init_sentry", lambda: events.append("sentry"))
    queue_module.init_worker_logging()
    queue_module.init_beat_observability()
    file_sinks = {"enqueue": False}
    assert events == ["logging", file_sinks, "sentry", "logging", file_sinks, "sentry"]


@pytest.mark.asyncio
async def test_actual_asgi_error_preserves_scoped_identity_and_removes_credentials(sentry_events):
    from types import SimpleNamespace
    from uuid import uuid4

    from fastapi import FastAPI, Request
    from httpx import ASGITransport, AsyncClient
    from rapidkit_core.nanoid import NanoIdPlugin
    from src.middlewares.context import ContextMiddleware

    app = FastAPI()
    app.add_middleware(ContextMiddleware, plugins=(NanoIdPlugin(),))
    secret = uuid4().hex

    @app.post("/error")
    async def error(request: Request):
        request.state.auth = SimpleNamespace(subject_user_id="asgi-user")
        raise ValueError("unexpected application failure")

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.post(
            "/error?token=" + secret,
            headers={"Authorization": "Bearer " + secret, "Cookie": "session=" + secret, "X-Request-ID": "S" * 21},
            json={"password": secret},
        )
    assert response.status_code == 500
    errors = [event for event in sentry_events if event.get("exception")]
    assert len(errors) == 1
    assert errors[0]["tags"]["request_id"] == "S" * 21
    assert errors[0]["user"] == {"id": "asgi-user"}
    assert secret not in json.dumps(errors)


def test_celery_retry_control_flow_is_not_reported(sentry_events):
    from celery.exceptions import Retry

    with pytest.raises(Retry), observability.sentry_scope():
        raise Retry()
    assert sentry_events == []
