"""Credential-free user snapshots shared by authentication consumers."""

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, EmailStr

from rapidkit_common.enums import Status
from rapidkit_common.schemas.base import BaseModel


class AuthUser(BaseModel):
    """The same typed identity whether loaded from Redis or the database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: EmailStr
    username: str
    status: Status
    is_admin: bool
    roles: list[str]
    department_id: UUID | None = None
    create_time: datetime
    update_time: datetime
