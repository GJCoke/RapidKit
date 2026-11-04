from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from plugin_worker import event_service
from plugin_worker.event_service import EventService
from plugin_worker.models import CeleryTaskResult, CeleryWorker, TaskReceipt
from rapidkit_common.enums import TaskStatus, WorkerStatus
from tests.testing.utils import one_event


async def test_unknown_worker_offline(json_log):
    service = EventService(None, None)
    service.worker_crud = NS(get_by_hostname=AsyncMock(return_value=None))
    await service.handle_worker_offline({"hostname": "worker@node"})
    row = one_event(json_log(), "worker.event.skipped")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("INFO", "skipped", "worker_unknown")
    assert "private-" not in str(json_log())


async def test_offline_activity_suppressed(monkeypatch, json_log):
    worker = CeleryWorker(hostname="worker@node", status=WorkerStatus.OFFLINE, lifecycle="active")
    service = EventService(NS(flush=AsyncMock()), None)
    service.worker_crud = NS(get_by_hostname=AsyncMock(return_value=worker))
    monkeypatch.setattr(service, "_emit_worker_status", AsyncMock())
    monkeypatch.setattr(event_service, "is_current_worker", lambda *_: True)
    await service.handle_worker_offline({"hostname": worker.hostname})
    assert worker.status == WorkerStatus.OFFLINE
    row = one_event(json_log(), "worker.event.skipped")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("INFO", "skipped", "offline_event_suppressed")
    assert "private-" not in str(json_log())


async def test_heartbeat_registers_worker(monkeypatch, json_log):
    service = EventService(None, None)
    service.worker_crud = NS(get_by_hostname=AsyncMock(return_value=None))
    monkeypatch.setattr(service, "handle_worker_online", AsyncMock())
    await service.handle_worker_heartbeat({"hostname": "worker@node"})
    row = one_event(json_log(), "worker.event.fallback")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("INFO", "fallback", "worker_auto_registered")
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("method", ["handle_task_started", "handle_task_success", "handle_task_retry"])
async def test_task_after_retention(method, json_log):
    receipt = TaskReceipt(task_id="retained-task", attempt=2)
    session = NS(exec=AsyncMock(return_value=NS(first=lambda: receipt)))
    service = EventService(session, None)
    service.task_crud = NS(get_by_task_id=AsyncMock(return_value=None))
    await getattr(service, method)(
        {"task_id": "retained-task", "attempt": 2, "args": ["private-args"], "exception": "private-error"}
    )
    row = one_event(json_log(), "worker.task_event.skipped")
    assert (row["level"], row["outcome"], row["reason_code"], row["task_id"], row["attempt"]) == (
        "INFO",
        "skipped",
        "event_after_retention",
        "retained-task",
        2,
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("method", ["handle_task_started", "handle_task_success"])
async def test_counter_missing_worker_keeps_task_id(method, monkeypatch, json_log):
    task = CeleryTaskResult(task_id="started-task", task_name="test.task", worker_hostname="worker@node")
    service = EventService(NS(flush=AsyncMock(), add=lambda *_: None), None)
    service.task_crud = NS(get_by_task_id=AsyncMock(return_value=None), upsert_by_task_id=AsyncMock(return_value=task))
    service.worker_crud = NS(get_by_hostname=AsyncMock(return_value=None))
    monkeypatch.setattr(service, "_load_execution", AsyncMock(return_value=(None, False)))
    monkeypatch.setattr(event_service, "after_commit", lambda *_: None)
    monkeypatch.setattr(service, "_audit_execution", AsyncMock())
    await getattr(service, method)({"task_id": "started-task", "hostname": "worker@node", "args": ["private-args"]})
    row = one_event(json_log(), "worker.counter.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["task_id"]) == (
        "WARNING",
        "degraded",
        "worker_row_missing",
        "started-task",
    )
    assert "private-" not in str(json_log())


async def test_retire_already_retired(monkeypatch, json_log):
    from plugin_worker import api

    worker = CeleryWorker(hostname="worker@node", lifecycle="retired", status=WorkerStatus.OFFLINE)
    monkeypatch.setattr(api, "_control_worker", AsyncMock(return_value=worker))
    result = await api.retire_worker_endpoint(worker.id, None)
    assert result.data.lifecycle == "retired"
    row = one_event(json_log(), "worker.worker.noop")
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_type"], row["resource_id"]) == (
        "INFO",
        "noop",
        "already_retired",
        "worker",
        str(worker.id),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("failed", ["stats", "active"])
async def test_runtime_inspect_swallowed_exception(failed, json_log):
    from plugin_worker.runtime import inspect_worker_runtime

    app = MagicMock()
    inspector = app.control.inspect.return_value
    inspector.stats.return_value = {}
    inspector.active.return_value = {}
    getattr(inspector, failed).side_effect = RuntimeError("private-broker-error")
    result = await inspect_worker_runtime(app, "worker@node")
    assert result["runtime_concurrency"] is None and result["runtime_active_tasks"] is None
    row = one_event(json_log(), "worker.inspect.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["exception_type"]) == (
        "WARNING",
        "degraded",
        "inspect_failed",
        "RuntimeError",
    )
    assert "private-" not in str(json_log())
