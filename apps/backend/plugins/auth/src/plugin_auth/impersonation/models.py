from datetime import datetime
from enum import StrEnum
from uuid import UUID

from rapidkit_common.models import SQLModel
from rapidkit_core.timezone import timezone
from sqlalchemy import Index, text
from sqlmodel import Field


class EndReason(StrEnum):
    STOPPED = "stopped"
    EXPIRED = "expired"
    REPLACED = "replaced"
    ACTOR_REVOKED = "actor_revoked"
    SUBJECT_REVOKED = "subject_revoked"


class ImpersonationSession(SQLModel, table=True):
    __tablename__ = "auth_impersonation_sessions"
    __table_args__ = (
        Index("uq_auth_impersonation_active_actor", "actor_id", unique=True, postgresql_where=text("ended_at IS NULL")),
    )

    actor_id: UUID = Field(index=True)
    subject_user_id: UUID = Field(index=True)
    reason: str | None = Field(default=None, max_length=500)
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=timezone.now)
    expires_at: datetime = Field(index=True)
    ended_at: datetime | None = Field(default=None, index=True)
    end_reason: str | None = Field(default=None, max_length=30)
