"""Idempotent audit append; callers retain ownership of business transactions."""

from rapidkit_common.audit import AuditRecord
from rapidkit_core.database import AsyncSessionLocal
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from plugin_system.models import AuditLog


class AuditWriterImpl:
    async def append(self, record: AuditRecord) -> None:
        async with AsyncSessionLocal() as session:
            await self.append_in_transaction(session, record)
            await session.commit()

    async def append_in_transaction(self, session: AsyncSession, record: AuditRecord) -> None:
        values = record.persistence_data()
        try:
            async with session.begin_nested():
                session.add(AuditLog.model_validate(values))
                await session.flush()
        except IntegrityError:
            existing = (await session.execute(select(AuditLog).where(AuditLog.id == record.id))).scalar_one_or_none()
            if existing is None:
                raise
            if any(getattr(existing, key) != value for key, value in values.items()):
                raise ValueError("Audit event has conflicting content") from None
