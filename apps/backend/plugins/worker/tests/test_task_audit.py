from types import SimpleNamespace

import pytest
from plugin_worker.services import trigger_task
from rapidkit_common.audit import AuditContext, current_audit

pytestmark = pytest.mark.asyncio


async def test_submitted_task_carries_correlation_without_claiming_completion():
    headers = []

    def send(name, **kwargs):
        headers.append(kwargs.get("headers", {}))
        return SimpleNamespace(id="task-1")

    app = SimpleNamespace(
        send_task=send, tasks={"work": object()}, loader=SimpleNamespace(import_default_modules=lambda: None)
    )
    context = AuditContext()
    context.record.action = "task.submit"
    token = current_audit.set(context)
    try:
        await trigger_task(app, "work", [], {})
        assert headers[0]["audit_correlation_id"]
        assert context.record.resource_id == "task-1"
        assert context.record.action == "task.submit"
    finally:
        current_audit.reset(token)


async def test_retry_replay_and_out_of_order_events_keep_one_audit_per_attempt(monkeypatch):
    from unittest.mock import AsyncMock

    from plugin_system.audit_writer import AuditWriterImpl
    from plugin_system.models import AuditLog, AuditLogTarget
    from plugin_worker import event_service
    from plugin_worker.event_service import EventService
    from plugin_worker.models import CeleryTaskResult
    from rapidkit_common.enums import TaskStatus
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlmodel import select
    from sqlmodel.ext.asyncio.session import AsyncSession

    monkeypatch.setattr(event_service.settings, "AUDIT_V2_ENABLED", True)
    monkeypatch.setattr(event_service, "get_service_optional", lambda _: AuditWriterImpl())
    monkeypatch.setattr(event_service.event_bus, "fire_and_forget", lambda _: None)
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    try:
        async with engine.begin() as connection:
            for table in (CeleryTaskResult.__table__, AuditLog.__table__, AuditLogTarget.__table__):
                await connection.run_sync(table.create)
        async with AsyncSession(engine, expire_on_commit=False) as session:
            service = EventService(session, SimpleNamespace(emit=AsyncMock()))
            base = {"task_id": "retry-audit-task", "task_name": "demo.task", "audit_correlation_id": "request-demo"}
            await service.handle_task_started({**base, "attempt": 0})
            await service.handle_task_retry({**base, "attempt": 0})
            await service.handle_task_retry({**base, "attempt": 0})
            await service.handle_task_started({**base, "attempt": 1})
            await service.handle_task_success({**base, "attempt": 1})
            await service.handle_task_success({**base, "attempt": 1})
            await service.handle_task_failure({**base, "attempt": 0})
            await service.handle_task_retry({**base, "attempt": 0})
            await service.handle_task_revoked({**base, "attempt": 0})
            await session.commit()
            task = (await session.exec(select(CeleryTaskResult))).one()
            rows = (await session.exec(select(AuditLog).order_by(AuditLog.occurred_at))).all()
            assert task.status == TaskStatus.SUCCESS
            assert task.retries == 1
            assert [(row.result, row.extra_data["attempt"]) for row in rows] == [("failure", 0), ("success", 1)]
            assert {row.correlation_id for row in rows} == {"request-demo"}
    finally:
        await engine.dispose()
