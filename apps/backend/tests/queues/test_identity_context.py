import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from celery import Celery
from celery import Task as CeleryTask
from plugin_worker import event_service as worker_events
from plugin_worker.models import CeleryTaskResult
from rapidkit_common.events import TaskSucceededEvent
from rapidkit_framework.events import EventBus
from rapidkit_framework.identity import IdentityMetadata, current_identity, identity_scope
from src.queues import consumer, signals
from src.queues.task import Task


class IdentityTask(Task):
    name = "test.identity"

    def run(self, fail=False):
        identity = current_identity()
        if fail:
            raise ValueError("task failed")
        return identity


IdentityTask.bind(Celery("identity-tests", broker="memory://"))


@pytest.mark.parametrize(
    "identity", [IdentityMetadata(), IdentityMetadata("subject", "admin", "session"), IdentityMetadata(user_id="user")]
)
def test_apply_async_strips_forged_identity_and_preserves_correlation(identity):
    task = IdentityTask()
    supplied = {
        "actor_id": "forged",
        "user_id": "forged",
        "impersonation_session_id": "forged",
        "correlation_id": "correlation",
    }
    with (
        identity_scope(identity),
        patch.object(CeleryTask, "apply_async", return_value=SimpleNamespace(id="queued")) as parent,
    ):
        task.apply_async(headers=supplied)
    expected = {"correlation_id": "correlation"}
    expected.update({key: value for key, value in vars(identity).items() if value is not None})
    assert parent.call_args.kwargs["headers"] == expected
    assert supplied["actor_id"] == "forged"


def test_sequential_task_identity_and_failure_cleanup():
    task = IdentityTask()
    outer = IdentityMetadata("outer", "outer")
    with identity_scope(outer):
        task.push_request(headers={"user_id": "subject", "actor_id": "admin", "impersonation_session_id": "session"})
        try:
            assert task() == IdentityMetadata("subject", "admin", "session")
            with pytest.raises(ValueError):
                task(fail=True)
            assert current_identity() == outer
        finally:
            task.pop_request()
        assert task() == IdentityMetadata()
        assert current_identity() == outer


@pytest.mark.asyncio
async def test_signal_stream_consumer_domain_event_roundtrip_and_no_leak(monkeypatch):
    emitted = []
    monkeypatch.setattr(signals, "_publish_event", lambda event_type, data: emitted.append((event_type, data)))
    headers = {"user_id": "subject", "actor_id": "admin", "impersonation_session_id": "session"}
    for index, metadata in enumerate([headers, {}]):
        sender = SimpleNamespace(name="test.identity", request=SimpleNamespace(headers=metadata, hostname=""))
        signals.on_task_postrun(sender, str(index), "done", "SUCCESS")
    redis = AsyncMock()
    redis.xreadgroup.side_effect = [
        [
            (
                "celery:events",
                [
                    (str(index), {"event_type": event_type, "data": json.dumps(data)})
                    for index, (event_type, data) in enumerate(emitted)
                ],
            )
        ],
        asyncio.CancelledError(),
    ]
    monkeypatch.setattr(consumer.RedisManager, "client", lambda: redis)

    @asynccontextmanager
    async def session_factory():
        yield AsyncMock()

    monkeypatch.setattr(consumer, "AsyncSessionLocal", session_factory)
    previous = EventBus._instance
    EventBus._reset()
    bus = EventBus()
    monkeypatch.setattr(worker_events, "event_bus", bus)
    observed = []
    bus.on(
        TaskSucceededEvent, lambda event: observed.append((event.actor_id, event.identity_metadata, current_identity()))
    )
    original_service = worker_events.EventService

    def service_factory(session, sio):
        service = original_service(session, sio)
        service.task_crud = AsyncMock()
        service.task_crud.get_by_task_id.return_value = None
        service.task_crud.upsert_by_task_id.side_effect = lambda task_id, data: CeleryTaskResult(
            task_id=task_id, **data
        )
        return service

    monkeypatch.setattr(consumer, "EventService", service_factory)
    try:
        await consumer.consume_events(AsyncMock())
        await bus.shutdown()
        identity = IdentityMetadata("subject", "admin", "session")
        assert observed == [("admin", identity, identity), (None, IdentityMetadata(), IdentityMetadata())]
        assert current_identity() == IdentityMetadata()
        assert redis.xack.await_count == 2
    finally:
        EventBus._instance = previous


@pytest.mark.parametrize("signal", ["started", "failure", "retry", "revoked"])
def test_monitor_signals_preserve_identity_from_request(monkeypatch, signal):
    payloads = []
    monkeypatch.setattr(signals, "_publish_event", lambda name, payload: payloads.append(payload))
    headers = {"user_id": "subject", "actor_id": "admin", "impersonation_session_id": "session"}
    request = SimpleNamespace(headers=headers, id="task", hostname="worker")
    sender = SimpleNamespace(name="task.name", request=request)
    if signal == "started":
        signals.on_task_prerun(sender, "task", (), {})
    elif signal == "failure":
        signals.on_task_failure(sender, "task", ValueError("failed"), None)
    elif signal == "retry":
        signals.on_task_retry(sender, request, "retry")
    else:
        signals.on_task_revoked(sender, SimpleNamespace(id="task", request_dict=headers), False, None, False)
    assert {key: payloads[0][key] for key in headers} == headers


class AsyncIdentityTask(IdentityTask):
    async def run(self, fail=False):
        await asyncio.sleep(0)
        if fail:
            raise ValueError("async task failed")
        return current_identity()


AsyncIdentityTask.bind(Celery("async-identity-tests", broker="memory://"))


def test_async_task_identity_is_independent_of_monitoring(monkeypatch):
    monkeypatch.setattr("rapidkit_core.config.settings.ENABLE_CELERY_MONITOR", False)
    task = AsyncIdentityTask()
    task.push_request(headers={"user_id": "subject", "actor_id": "admin", "impersonation_session_id": "session"})
    try:
        assert task() == IdentityMetadata("subject", "admin", "session")
        with pytest.raises(ValueError, match="async task failed"):
            task(fail=True)
        assert current_identity() == IdentityMetadata()
    finally:
        task.pop_request()
