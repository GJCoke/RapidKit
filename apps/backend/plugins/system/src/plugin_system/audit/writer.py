"""Idempotent audit append; callers retain ownership of business transactions."""

from rapidkit_common.audit import AuditRecord
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from plugin_system.audit.models import AuditLog, AuditLogTarget

logger = get_plugin_logger("System")


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
                for target in record.targets:
                    session.add(AuditLogTarget(audit_log_id=record.id, **target.model_dump()))
                await session.flush()
        except IntegrityError:
            existing = (await session.execute(select(AuditLog).where(AuditLog.id == record.id))).scalar_one_or_none()
            if existing is None:
                raise
            if any(getattr(existing, key) != value for key, value in values.items()):
                raise ValueError("Audit event has conflicting content") from None
            logger.bind(
                event="system.audit.deduplicated",
                outcome="deduplicated",
                reason_code="duplicate_audit_record",
                resource_id=record.id,
            ).info("Duplicate audit record accepted")
