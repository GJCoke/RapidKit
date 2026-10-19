"""Read-only session queries for consumers outside the authentication plugin."""

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from datetime import UTC
from uuid import UUID

from rapidkit_core.timezone import timezone
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_auth.impersonation.models import ImpersonationSession


class ImpersonationSessionReaderImpl:
    def __init__(self, session_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]]) -> None:
        self.session_factory = session_factory

    async def get_expiry(self, session_id: UUID) -> int | None:
        async with self.session_factory() as session:
            record = await session.get(ImpersonationSession, session_id)
            if record is None:
                return None
            return int(record.expires_at.replace(tzinfo=UTC).timestamp())

    async def validate_identity(self, session_id: UUID, actor_id: UUID, subject_id: UUID, expires_at: int) -> bool:
        async with self.session_factory() as session:
            record = await session.get(ImpersonationSession, session_id)
            return bool(
                record is not None
                and record.ended_at is None
                and record.actor_id == actor_id
                and record.subject_user_id == subject_id
                and int(record.expires_at.replace(tzinfo=UTC).timestamp()) == expires_at
                and record.expires_at > timezone.now()
            )
