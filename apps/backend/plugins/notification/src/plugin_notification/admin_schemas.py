"""Schemas for administrative notification APIs."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field
from rapidkit_common.protocols.notification import (
    AudienceType,
    ContentFormat,
    NotificationChannel,
    NotificationLevel,
)
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import LocalDatetime

from plugin_notification.enums import MessageStatus, OutboxStatus

TemplateContentMode = Literal["i18n", "raw"]


def _in_app_channels() -> list[NotificationChannel]:
    return ["in_app"]


class TemplateCreateRequest(BaseRequest):
    code: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    category: str = Field(min_length=1, max_length=128)
    level: NotificationLevel = "info"
    content_mode: TemplateContentMode
    title_template: str = Field(min_length=1, max_length=512)
    content_template: str = Field(min_length=1)
    content_format: ContentFormat | None = None
    variable_schema: dict[str, dict[str, Any]] = Field(default_factory=dict)
    default_channels: list[NotificationChannel] = Field(
        default_factory=_in_app_channels,
        min_length=1,
    )
    default_action: dict[str, Any] | None = None
    mandatory: bool = False
    enabled: bool = True


class TemplateUpdateRequest(BaseRequest):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    category: str | None = Field(default=None, min_length=1, max_length=128)
    level: NotificationLevel | None = None
    title_template: str | None = Field(default=None, min_length=1, max_length=512)
    content_template: str | None = Field(default=None, min_length=1)
    content_format: ContentFormat | None = None
    variable_schema: dict[str, dict[str, Any]] | None = None
    default_channels: list[NotificationChannel] | None = Field(
        default=None,
        min_length=1,
    )
    default_action: dict[str, Any] | None = None
    mandatory: bool | None = None
    enabled: bool | None = None


class TemplateResponse(BaseSchema):
    code: str
    name: str
    category: str
    level: NotificationLevel
    content_mode: TemplateContentMode
    title_template: str
    content_template: str
    content_format: ContentFormat | None = None
    variable_schema: dict[str, dict[str, Any]]
    default_channels: list[NotificationChannel]
    default_action: dict[str, Any] | None = None
    mandatory: bool
    enabled: bool
    version: int


class TemplateListQuery(PaginatedRequest):
    keyword: str | None = Field(default=None, max_length=128)
    enabled: bool | None = None


class AudienceRuleIn(BaseModel):
    type: AudienceType
    value: str | None = Field(default=None, max_length=256)
    include_descendants: bool = False


class ActionIn(BaseModel):
    route: str = Field(min_length=1, max_length=128)
    params: dict[str, Any] = Field(default_factory=dict)
    label: str | None = Field(default=None, max_length=64)


class AnnouncementCreateRequest(BaseRequest):
    category: str = Field(default="admin.announcement", min_length=1, max_length=128)
    level: NotificationLevel = "info"
    template_code: str | None = Field(default=None, max_length=128)
    template_variables: dict[str, Any] = Field(default_factory=dict)
    i18n_key: str | None = Field(default=None, max_length=256)
    i18n_params: dict[str, Any] = Field(default_factory=dict)
    raw_title: str | None = Field(default=None, max_length=256)
    raw_content: str | None = None
    raw_format: ContentFormat = "plain_text"
    audience: list[AudienceRuleIn] = Field(min_length=1)
    mandatory: bool = False
    channels: list[NotificationChannel] = Field(
        default_factory=_in_app_channels,
        min_length=1,
    )
    action: ActionIn | None = None
    publish_at: datetime | None = None
    expire_at: datetime | None = None


class AudiencePreviewRequest(BaseRequest):
    audience: list[AudienceRuleIn] = Field(min_length=1)


class AudiencePreviewResponse(BaseModel):
    total: int
    by_type: dict[str, int] = Field(default_factory=dict)


AnnouncementUpdateRequest = AnnouncementCreateRequest


class MessageAdminResponse(BaseSchema):
    source: str
    category: str
    level: NotificationLevel
    content_mode: str
    title: str
    content: str
    status: MessageStatus
    mandatory: bool
    publish_at: LocalDatetime | None = None
    published_at: LocalDatetime | None = None
    expire_at: LocalDatetime | None = None
    recalled_at: LocalDatetime | None = None
    cancelled_at: LocalDatetime | None = None


class MessageAdminDetailResponse(MessageAdminResponse):
    content_params: dict[str, Any] | None = None
    content_format: ContentFormat | None = None
    channels: list[NotificationChannel]
    action: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None
    template_id: UUID | None = None
    template_code: str | None = None
    audiences: list[AudienceRuleIn]


class MessageListQuery(PaginatedRequest):
    status: MessageStatus | None = None
    category: str | None = Field(default=None, max_length=128)


class DeliveryResponse(BaseSchema):
    message_id: UUID
    user_id: UUID
    channel: NotificationChannel
    status: OutboxStatus
    attempt_count: int
    last_error_code: str | None = None
    next_attempt_at: LocalDatetime | None = None
    locked_until: LocalDatetime | None = None
    sent_at: LocalDatetime | None = None


class DeliverySummaryResponse(BaseModel):
    message_id: UUID
    by_status: dict[str, int] = Field(default_factory=dict)


class DeliveryListQuery(PaginatedRequest):
    message_id: UUID | None = None
    status: OutboxStatus | None = None
