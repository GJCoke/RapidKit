import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from plugin_system.audit.models import AuditLog
from plugin_system.audit.writer import AuditWriterImpl
from plugin_worker import event_service
from plugin_worker.crud import TaskResultCRUD
from plugin_worker.event_service import EventService
from plugin_worker.models import CeleryTaskResult, CeleryWorker
from plugin_worker.schemas import TaskListResponse, TaskQueryRequest, TaskResponse
from rapidkit_common.enums import TaskStatus
from rapidkit_core.config import settings
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest.fixture
def execution_audit(monkeypatch):
    monkeypatch.setattr(settings, "AUDIT_ENABLED", True)
    monkeypatch.setattr(event_service, "get_service_optional", lambda _: AuditWriterImpl())
    monkeypatch.setattr(event_service.event_bus, "fire_and_forget", lambda _: None)


async def test_nullable_lineage_is_persisted_filtered_and_audited(session, execution_audit):
    assert {"request_id", "correlation_id"} <= CeleryTaskResult.model_fields.keys()
    legacy = CeleryTaskResult(task_id="legacy", task_name="demo")
    session.add(legacy)
    await session.commit()
    assert TaskResponse.model_validate(legacy).request_id is None
    service = EventService(session, SimpleNamespace(emit=AsyncMock()))
    data = {"task_id": "linked", "task_name": "demo", "request_id": "request-one", "audit_correlation_id": "flow-one"}
    await service.handle_task_started(data)
    await service.handle_task_success({"task_id": "linked"})
    await session.commit()
    task = await service.task_crud.get_by_task_id("linked")
    assert (task.request_id, task.correlation_id) == ("request-one", "flow-one")
    assert TaskListResponse.model_validate(task).correlation_id == "flow-one"
    for query in ({"request_id": "request-one"}, {"correlation_id": "flow-one"}):
        result = await TaskResultCRUD(session).get_paginate_tasks(TaskQueryRequest(**query))
        assert [item.task_id for item in result.records] == ["linked"]
    rows = (await session.exec(select(AuditLog).where(AuditLog.resource_id == "linked"))).all()
    assert [(row.request_id, row.correlation_id) for row in rows] == [("request-one", "flow-one")]


async def test_missing_start_retry_preserves_known_worker_and_lineage(session, execution_audit):
    service = EventService(session, SimpleNamespace(emit=AsyncMock()))
    await service.handle_task_retry(
        {
            "task_id": "retry-only",
            "task_name": "demo",
            "attempt": 0,
            "hostname": "retry-worker",
            "request_id": "retry-request",
        }
    )
    await session.commit()
    task = await service.task_crud.get_by_task_id("retry-only")
    assert task.worker_hostname == "retry-worker"
    assert task.request_id == task.correlation_id == "retry-request"
    assert task.status == TaskStatus.RETRY and task.retries == 1


async def test_concurrent_creation_retry_and_terminal_are_idempotent(session, pg_engine, execution_audit):
    worker = CeleryWorker(hostname="concurrent-worker")
    session.add(worker)
    await session.commit()
    sessions = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    base = {"task_id": "concurrent-task", "task_name": "demo", "hostname": worker.hostname, "attempt": 0}

    async def deliver(kind, payload):
        async with sessions() as tx:
            await getattr(EventService(tx, SimpleNamespace(emit=AsyncMock())), "handle_task_" + kind)(payload)
            await tx.commit()

    await asyncio.gather(*(deliver("started", base) for _ in range(6)))
    await session.refresh(worker)
    assert worker.active_task_count == 1
    await asyncio.gather(*(deliver("retry", base) for _ in range(6)))
    await session.refresh(worker)
    assert worker.active_task_count == 0
    await deliver("success", base)  # Previous attempt completion cannot finish the retry.
    next_attempt = {**base, "attempt": 1}
    await asyncio.gather(*(deliver("started", next_attempt) for _ in range(6)))
    await asyncio.gather(*(deliver("success", next_attempt) for _ in range(6)))
    await deliver("failure", base)
    await deliver("revoked", base)
    await session.refresh(worker)
    assert (worker.active_task_count, worker.processed_count) == (0, 1)
    task = await TaskResultCRUD(session).get_by_task_id(base["task_id"])
    assert task.status == TaskStatus.SUCCESS and task.retries == 1
    rows = (await session.exec(select(AuditLog).where(AuditLog.resource_id == base["task_id"]))).all()
    assert sorted((row.extra_data["attempt"], row.result) for row in rows) == [(0, "failure"), (1, "success")]


@pytest.mark.parametrize("terminal", ["success", "failure", "revoked"])
async def test_missing_start_and_distinct_tasks_share_atomic_worker_counters(
    session, pg_engine, execution_audit, terminal
):
    session.add(CeleryWorker(hostname="shared-worker", active_task_count=2))
    await session.commit()
    sessions = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

    async def complete(number):
        async with sessions() as tx:
            service = EventService(tx, SimpleNamespace(emit=AsyncMock()))
            data = {"task_id": f"missing-{number}", "task_name": "demo", "hostname": "shared-worker", "attempt": 0}
            await getattr(service, "handle_task_" + terminal)(data)
            await tx.commit()

    await asyncio.gather(*(complete(number) for number in range(12)))
    await asyncio.gather(*(complete(0) for _ in range(5)))
    worker = (await session.exec(select(CeleryWorker))).one()
    assert (worker.active_task_count, worker.processed_count) == (2, 12)
    rows = (await session.exec(select(AuditLog))).all()
    assert len(rows) == 12
