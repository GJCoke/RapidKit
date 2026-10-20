"""Global banner wire contract: timing fields always identify UTC instants."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field
from rapidkit_common.protocols.notification import NotificationLevel
from rapidkit_common.schemas.base import BaseModel

from plugin_notification.schemas import UTCInstant


class BannerPublishRequest(BaseModel):
    banner_revision: int | None = Field(default=None, ge=0)
    replace_current: bool = False
    replace_scheduled: bool = False


class BannerCheckRequest(BaseModel):
    publish_at: datetime | None = None
    expire_at: datetime | None = None
    message_id: UUID | None = None


class BannerSummary(BaseModel):
    id: UUID
    title: str
    level: NotificationLevel
    content_mode: str
    content_params: dict[str, Any] | None = None
    content: str
    content_format: str | None = None
    action: dict[str, Any] | None = None
    publish_at: UTCInstant | None = None
    published_at: UTCInstant | None = None
    expire_at: UTCInstant | None = None
    status: str


class BannerCheckResponse(BaseModel):
    revision: int
    server_now: UTCInstant
    current: BannerSummary | None = None
    scheduled: BannerSummary | None = None


class TopBannerResponse(BaseModel):
    current: BannerSummary | None = None
    revision: int
    server_now: UTCInstant
    next_change_at: UTCInstant | None = None
