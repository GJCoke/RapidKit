"""Read-only session access preserves socket identity checks behind a protocol."""

from datetime import UTC, timedelta
from uuid import uuid4

from plugin_auth import register
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_auth.impersonation.session_reader import ImpersonationSessionReaderImpl
from rapidkit_common.protocols.impersonation import ImpersonationSessionReader
from rapidkit_core.timezone import timezone
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession


def test_auth_provides_session_reader():
    assert ImpersonationSessionReader in register().provides


async def test_unknown_session_is_unavailable(pg_engine, session):
    reader = ImpersonationSessionReaderImpl(async_sessionmaker(pg_engine, class_=AsyncSession))
    missing = uuid4()
    assert await reader.get_expiry(missing) is None
    assert not await reader.validate_identity(missing, uuid4(), uuid4(), 0)


async def test_identity_binds_actor_subject_expiry_and_session_state(pg_engine, session):
    record = ImpersonationSession(
        actor_id=uuid4(), subject_user_id=uuid4(), expires_at=timezone.now() + timedelta(minutes=5)
    )
    session.add(record)
    await session.commit()
    reader = ImpersonationSessionReaderImpl(async_sessionmaker(pg_engine, class_=AsyncSession))
    expiry = int(record.expires_at.replace(tzinfo=UTC).timestamp())
    assert await reader.get_expiry(record.id) == expiry
    assert await reader.validate_identity(record.id, record.actor_id, record.subject_user_id, expiry)
    assert not await reader.validate_identity(record.id, uuid4(), record.subject_user_id, expiry)
    assert not await reader.validate_identity(record.id, record.actor_id, uuid4(), expiry)
    assert not await reader.validate_identity(record.id, record.actor_id, record.subject_user_id, expiry + 1)

    record.ended_at = timezone.now()
    await session.commit()
    assert not await reader.validate_identity(record.id, record.actor_id, record.subject_user_id, expiry)

    record.ended_at = None
    record.expires_at = timezone.now() - timedelta(seconds=1)
    await session.commit()
    expiry = int(record.expires_at.replace(tzinfo=UTC).timestamp())
    assert not await reader.validate_identity(record.id, record.actor_id, record.subject_user_id, expiry)
