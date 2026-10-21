"""Audit service boundary used by business plugins."""

from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from rapidkit_common.audit import AuditRecord


class AuditWriter(Protocol):
    async def append(self, record: AuditRecord) -> None: ...

    async def append_in_transaction(self, session: AsyncSession, record: AuditRecord) -> None: ...
