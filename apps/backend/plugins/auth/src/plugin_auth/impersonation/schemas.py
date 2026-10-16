from datetime import UTC, datetime
from uuid import UUID

from pydantic import Field, field_serializer
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest
from rapidkit_common.schemas.types import LocalDatetime


class ImpersonationCreateBody(BaseRequest):
    target_user_id: UUID
    reason: str | None = Field(default=None, max_length=500)


class UserSummary(BaseModel):
    id: UUID
    name: str
    username: str


class ImpersonationTimes(BaseModel):
    expires_at: LocalDatetime

    @field_serializer("expires_at")
    def serialize_expiration(self, value: datetime) -> str:
        return value.replace(tzinfo=UTC).isoformat() if value.tzinfo is None else value.isoformat()


class ImpersonationCreated(ImpersonationTimes):
    access_token: str
    session_id: UUID
    subject: UserSummary


class ImpersonationCurrent(ImpersonationTimes):
    session_id: UUID
    actor: UserSummary
    subject: UserSummary
    created_at: LocalDatetime

    @field_serializer("created_at")
    def serialize_creation(self, value: datetime) -> str:
        return value.replace(tzinfo=UTC).isoformat() if value.tzinfo is None else value.isoformat()
