# ruff: noqa: F811
from datetime import timedelta
from importlib import import_module

import pytest
from plugin_auth import register
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_system.models import AuditLog
from plugins.auth.tests.test_impersonation_service import setup_service, start  # noqa: F401
from rapidkit_common.protocols.impersonation import ImpersonationRevoker
from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7
from sqlmodel import select
from src.queues.app import app


@pytest.mark.asyncio
async def test_expiry_scan_is_idempotent(setup_service):
    service, users, factory = setup_service
    record = await start(service, users)
    async with factory() as session:
        stored = await session.get(ImpersonationSession, record.id)
        stored.expires_at = timezone.now() - timedelta(seconds=1)
        await session.commit()
    await service.expire_due()
    await service.expire_due()
    async with factory() as session:
        stored = await session.get(ImpersonationSession, record.id)
        assert stored.end_reason == "expired"
        logs = (
            await session.exec(
                select(AuditLog).where(
                    AuditLog.impersonation_session_id == record.id, AuditLog.action == "impersonation.expire"
                )
            )
        ).all()
        assert len(logs) == 1


@pytest.mark.asyncio
async def test_manifest_registered_task_executes(setup_service, monkeypatch):

    service, users, factory = setup_service
    record = await start(service, users)
    async with factory() as session:
        stored = await session.get(ImpersonationSession, record.id)
        stored.expires_at = timezone.now() - timedelta(seconds=1)
        await session.commit()
    manifest = register()
    assert ImpersonationRevoker in manifest.provides
    assert manifest.beat_schedule["expire-impersonation-sessions"] == {
        "task": "expire_impersonation_sessions",
        "schedule": 60.0,
    }
    assert "plugin_auth.impersonation.tasks" in manifest.task_modules
    module = import_module("plugin_auth.impersonation.tasks")
    monkeypatch.setattr(
        module,
        "get_service_optional",
        lambda protocol: service.audit if protocol.__name__ == "ImpersonationAuditWriter" else service.socket_closer,
    )
    task = app.tasks["expire_impersonation_sessions"]
    await task.run(redis=service.redis, session=factory)
    async with factory() as session:
        assert (await session.get(ImpersonationSession, record.id)).end_reason == "expired"


@pytest.mark.asyncio
async def test_expiry_scan_caps_batch_and_leaves_future_sessions(setup_service):
    service, users, factory = setup_service
    now = timezone.now()
    async with factory() as session:
        session.add_all(
            [
                ImpersonationSession(
                    actor_id=uuid7(),
                    subject_user_id=users[2].id,
                    created_at=now,
                    expires_at=now - timedelta(seconds=1),
                )
                for _ in range(501)
            ]
        )
        future = ImpersonationSession(
            actor_id=uuid7(), subject_user_id=users[2].id, created_at=now, expires_at=now + timedelta(hours=1)
        )
        session.add(future)
        await session.commit()
    await service.expire_due()
    async with factory() as session:
        pending = (
            await session.exec(select(ImpersonationSession).where(ImpersonationSession.ended_at.is_(None)))
        ).all()
        assert len(pending) == 2
        assert (await session.get(ImpersonationSession, future.id)).ended_at is None
    await service.expire_due()
    async with factory() as session:
        pending = (
            await session.exec(select(ImpersonationSession).where(ImpersonationSession.ended_at.is_(None)))
        ).all()
        assert [row.id for row in pending] == [future.id]
