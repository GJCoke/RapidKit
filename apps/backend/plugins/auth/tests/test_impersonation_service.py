import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from plugin_auth.impersonation.models import EndReason, ImpersonationSession
from plugin_auth.impersonation.service import ImpersonationService
from plugin_system.audit.impersonation import ImpersonationAuditWriterImpl
from plugin_system.audit.models import AuditLog
from plugin_user.models import User
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture
async def setup_service(session, pg_engine, redis):
    users = [
        User(name=f"User {i}", username=f"user{i}", email=f"user{i}@example.com", password=b"test", is_admin=i < 2)
        for i in range(3)
    ]
    session.add_all(users)
    await session.commit()
    factory = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    return ImpersonationService(factory, redis, ImpersonationAuditWriterImpl(), AsyncMock()), users, factory


async def start(service, users, actor=0):
    return await service.start(users[actor].id, users[2].id, reason="investigate", ip=None, user_agent=None)


@pytest.mark.asyncio
@pytest.mark.parametrize("replacement", [False, True])
async def test_audit_failure_rolls_back(setup_service, replacement):
    service, users, factory = setup_service
    old = await start(service, users) if replacement else None
    writer = service.audit

    async def fail_start(session, record):
        await writer.append(session, record)
        if record["action"] == "impersonation.start":
            raise RuntimeError("audit failed")

    service.audit = AsyncMock()
    service.audit.append.side_effect = fail_start
    with pytest.raises(AppException) as exc:
        await start(service, users)
    assert exc.value.code == 17001
    async with factory() as session:
        rows = (await session.exec(select(ImpersonationSession))).all()
        logs = (await session.exec(select(AuditLog))).all()
    assert len(rows) == len(logs) == int(replacement)
    if old:
        assert rows[0].id == old.id and rows[0].ended_at is None


@pytest.mark.asyncio
async def test_replacement_and_idempotent_end(setup_service):
    service, users, factory = setup_service
    old = await start(service, users)
    current = await start(service, users)
    await asyncio.gather(service.end(current.id, EndReason.STOPPED), service.end(current.id, EndReason.STOPPED))
    async with factory() as session:
        previous = await session.get(ImpersonationSession, old.id)
        ended = await session.get(ImpersonationSession, current.id)
        logs = (await session.exec(select(AuditLog))).all()
    assert previous.end_reason == "replaced"
    assert ended.end_reason == "stopped"
    assert len(logs) == 4
    initial = next(
        log for log in logs if log.impersonation_session_id == old.id and log.action == "impersonation.start"
    )
    assert initial.actor_name == users[0].name
    assert initial.extra_data["subject_name"] == users[2].name
    assert initial.extra_data["subject_username"] == users[2].username
    assert initial.extra_data["reason"] == "investigate"


@pytest.mark.asyncio
async def test_concurrent_starts_and_shared_subject(setup_service):
    service, users, factory = setup_service
    await asyncio.gather(start(service, users), start(service, users))
    await start(service, users, 1)
    async with factory() as session:
        rows = (await session.exec(select(ImpersonationSession).where(ImpersonationSession.ended_at.is_(None)))).all()
    assert len(rows) == 2
    assert {row.actor_id for row in rows} == {users[0].id, users[1].id}


@pytest.mark.asyncio
async def test_cleanup_failure_keeps_database_ended(setup_service):
    service, users, factory = setup_service
    service.redis = AsyncMock()
    service.redis.set.side_effect = RuntimeError("redis unavailable")
    record = await start(service, users)
    service.redis.delete.side_effect = RuntimeError("redis unavailable")
    service.socket_closer.close_session.side_effect = RuntimeError("socket unavailable")
    await service.end(record.id, EndReason.STOPPED)
    async with factory() as session:
        ended = await session.get(ImpersonationSession, record.id)
    assert ended.ended_at is not None
    service.socket_closer.close_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_lazy_services_and_missing_writer(setup_service, monkeypatch):
    service, users, factory = setup_service
    service.audit = service.socket_closer = None
    monkeypatch.setattr("plugin_auth.impersonation.service.get_service_optional", lambda protocol: None)
    with pytest.raises(AppException) as exc:
        await start(service, users)
    assert exc.value.code == 17001
    closer = AsyncMock()
    monkeypatch.setattr(
        "plugin_auth.impersonation.service.get_service_optional",
        lambda protocol: ImpersonationAuditWriterImpl() if protocol.__name__ == "ImpersonationAuditWriter" else closer,
    )
    record = await start(service, users)
    await service.end(record.id, EndReason.STOPPED)
    closer.close_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_end_audit_failure_rolls_back(setup_service):
    service, users, factory = setup_service
    record = await start(service, users)
    service.audit = AsyncMock()
    service.audit.append.side_effect = RuntimeError("audit failed")
    with pytest.raises(AppException) as exc:
        await service.end(record.id, EndReason.STOPPED)
    assert exc.value.code == 17001
    async with factory() as session:
        current = await session.get(ImpersonationSession, record.id)
        logs = (await session.exec(select(AuditLog))).all()
    assert current.ended_at is None and current.end_reason is None
    assert len(logs) == 1
    service.socket_closer.close_session.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("actor,target,code", [(2, 0, 14015), (0, 0, 14016), (0, 1, 14016)])
async def test_admission_rejected(setup_service, actor, target, code):
    service, users, factory = setup_service
    with pytest.raises(AppException) as exc:
        await service.start(users[actor].id, users[target].id, reason=None, ip=None, user_agent=None)
    assert exc.value.code == code
    async with factory() as session:
        assert not (await session.exec(select(ImpersonationSession))).all()


@pytest.mark.asyncio
async def test_cleanup_observes_committed_end(setup_service):
    service, users, factory = setup_service
    record = await start(service, users)

    async def check_committed(session_id, redis):
        async with factory() as session:
            current = await session.get(ImpersonationSession, session_id)
            assert current.ended_at is not None

    service.socket_closer.close_session.side_effect = check_committed
    await service.end(record.id, EndReason.STOPPED)
    service.socket_closer.close_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_stopping_unfinished_expired_session_records_expiry_once(setup_service):
    service, users, factory = setup_service
    record = await start(service, users)
    async with factory() as session:
        stored = await session.get(ImpersonationSession, record.id)
        stored.expires_at = timezone.now() - timedelta(seconds=1)
        await session.commit()
    await service.end(record.id, EndReason.STOPPED)
    await service.end(record.id, EndReason.STOPPED)
    async with factory() as session:
        stored = await session.get(ImpersonationSession, record.id)
        logs = (
            await session.exec(
                select(AuditLog).where(
                    AuditLog.impersonation_session_id == record.id,
                    AuditLog.action == "impersonation.expire",
                )
            )
        ).all()
    assert stored.end_reason == "expired"
    assert len(logs) == 1
