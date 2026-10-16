"""Write lifecycle audit records within the caller's transaction."""

from sqlalchemy.ext.asyncio import AsyncSession

from plugin_system.models import AuditLog


class ImpersonationAuditWriterImpl:
    """Flush security audits synchronously; transaction ownership stays with the caller."""

    async def append(self, session: AsyncSession, record: dict) -> None:
        session.add(AuditLog.model_validate(record))
        await session.flush()
