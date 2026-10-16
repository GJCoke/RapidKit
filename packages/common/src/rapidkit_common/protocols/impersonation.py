"""Shared contracts for impersonation auditing and session invalidation."""

from typing import TYPE_CHECKING, Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from rapidkit_core.redis_client import AsyncRedisClient


class ImpersonationAuditWriter(Protocol):
    async def append(self, session: AsyncSession, record: dict) -> None: ...


class ImpersonationRevoker(Protocol):
    async def revoke_user(self, user_id: UUID, redis: "AsyncRedisClient") -> None: ...


class ImpersonationSocketCloser(Protocol):
    async def close_session(self, session_id: UUID, redis: "AsyncRedisClient") -> None: ...
