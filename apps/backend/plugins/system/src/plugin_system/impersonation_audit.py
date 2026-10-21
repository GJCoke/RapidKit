"""Write lifecycle audit records within the caller's transaction."""

from rapidkit_core.nanoid import get_request_nanoid
from sqlalchemy.ext.asyncio import AsyncSession

from plugin_system.models import AuditLog


class ImpersonationAuditWriterImpl:
    """Flush security audits synchronously; transaction ownership stays with the caller."""

    async def append(self, session: AsyncSession, record: dict) -> None:
        record = {
            **record,
            "actor_type": "user",
            "request_id": None if get_request_nanoid() == "-" else get_request_nanoid(),
        }
        session.add(AuditLog.model_validate(record))
        await session.flush()
