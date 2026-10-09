"""Worker inspect errors must not be indistinguishable from empty tasks."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from plugin_worker import event_service
from plugin_worker.api import get_worker
from plugin_worker.models import CeleryWorker
from plugin_worker.runtime import inspect_worker_runtime
from plugin_worker.services import get_active_tasks, get_reserved_tasks, pool_grow
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException


@pytest.mark.parametrize("getter,method", [(get_active_tasks, "active"), (get_reserved_tasks, "reserved")])
def test_successful_empty_inspection(getter, method):
    app = MagicMock()
    getattr(app.control.inspect.return_value, method).return_value = {"celery@current": []}
    assert getter(app, "celery@current") == []


@pytest.mark.parametrize("getter,method", [(get_active_tasks, "active"), (get_reserved_tasks, "reserved")])
@pytest.mark.parametrize("reply", [None, {}, {"other-worker": []}])
def test_missing_worker_reply_is_failure(getter, method, reply):
    app = MagicMock()
    getattr(app.control.inspect.return_value, method).return_value = reply
    with pytest.raises(AppException):
        getter(app, "celery@current")


@pytest.mark.parametrize("getter,method", [(get_active_tasks, "active"), (get_reserved_tasks, "reserved")])
def test_inspector_exception_is_failure(getter, method):
    app = MagicMock()
    getattr(app.control.inspect.return_value, method).side_effect = RuntimeError("broker unavailable")
    with pytest.raises(AppException):
        getter(app, "celery@current")


@pytest.mark.asyncio
async def test_worker_heartbeat_event_keeps_utc_offset(monkeypatch):
    monkeypatch.setattr(event_service, "is_current_worker", lambda hostname: True)
    service = event_service.EventService(MagicMock(), AsyncMock())
    worker = SimpleNamespace(
        hostname="celery@current",
        status="1",
        concurrency=8,
        active_task_count=0,
        active_queues=[],
        last_heartbeat=datetime(2026, 10, 9, 3, 0),
        processed_count=4,
    )
    await service._emit_worker_status(worker)
    heartbeat = service.sio.emit.await_args_list[0].args[1]["lastHeartbeat"]
    assert heartbeat == "2026-10-09T03:00:00+00:00"


@pytest.mark.asyncio
async def test_worker_detail_inspects_missing_subscriptions_without_persisting():
    worker = CeleryWorker(hostname="celery@current", last_heartbeat=timezone.now())
    app = MagicMock()
    app.control.inspect.return_value.active_queues.return_value = {
        worker.hostname: [{"name": "celery"}, {"name": "priority"}]
    }
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(celery_app=app)))
    crud = MagicMock()
    crud.get = AsyncMock(return_value=worker)
    response = await get_worker(worker.id, crud, request)
    assert response.data.active_queues == ["celery", "priority"]
    assert worker.active_queues == []


@pytest.mark.asyncio
async def test_worker_detail_remains_readable_when_monitor_is_disabled():
    worker = CeleryWorker(hostname="celery@current", active_queues=["reported-queue"])
    crud = MagicMock()
    crud.get = AsyncMock(return_value=worker)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    response = await get_worker(worker.id, crud, request)
    assert response.data.active_queues == ["reported-queue"]


@pytest.mark.asyncio
async def test_runtime_capacity_uses_actual_prefork_processes_not_startup_limit():
    app = MagicMock()
    inspector = app.control.inspect.return_value
    inspector.stats.return_value = {"celery@current": {"pool": {"max-concurrency": 32, "processes": list(range(36))}}}
    inspector.active.return_value = {"celery@current": [{"id": "running"}]}
    result = await inspect_worker_runtime(app, "celery@current")
    assert result["runtime_concurrency"] == 36
    assert result["runtime_active_tasks"] == 1


@pytest.mark.asyncio
async def test_runtime_timeout_is_unknown_rather_than_zero():
    app = MagicMock()
    inspector = app.control.inspect.return_value
    inspector.stats.return_value = None
    inspector.active.return_value = None
    result = await inspect_worker_runtime(app, "celery@current")
    assert result["runtime_concurrency"] is None
    assert result["runtime_active_tasks"] is None
    assert result["runtime_sampled_at"] is None


@pytest.mark.parametrize(
    "reply", [None, [{"other-worker": {"ok": "pool will grow"}}], [{"celery@current": {"error": "unsupported"}}]]
)
def test_pool_resize_requires_acknowledgement_from_requested_worker(reply):
    app = MagicMock()
    app.control.pool_grow.return_value = reply
    with pytest.raises(AppException):
        pool_grow(app, "celery@current", 2)
