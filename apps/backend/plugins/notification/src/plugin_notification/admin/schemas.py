"""Schemas for administrative notification APIs."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator
from rapidkit_common.protocols.notification import (
    AudienceType,
    ContentFormat,
    LocalizedActionLabel,
    LocalizedContent,
    NotificationChannel,
    NotificationCommand,
    NotificationLevel,
    RecipientVariableBinding,
)
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import UTCInstant
from rapidkit_core.timezone import timezone

from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.schemas import EditableInstant

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
    create_time: UTCInstant
    update_time: UTCInstant
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
    type: Literal["menu", "external"] | None = None
    menu_id: UUID | None = None
    route: str | None = Field(default=None, min_length=1, max_length=128)
    params: dict[str, Any] = Field(default_factory=dict)
    query: dict[str, Any] = Field(default_factory=dict)
    url: str | None = Field(default=None, max_length=2048)
    path: str | None = Field(default=None, max_length=2048)
    label: str | None = Field(default=None, max_length=64)
    localized_label: LocalizedActionLabel | None = None


class AnnouncementCreateRequest(BaseRequest):
    display_mode: Literal["inbox", "top_banner"] = "inbox"
    client_request_id: UUID | None = None
    banner_revision: int | None = Field(default=None, ge=0)
    replace_current: bool = False
    replace_scheduled: bool = False
    category: str = Field(default="admin.announcement", min_length=1, max_length=128)
    level: NotificationLevel = "info"
    template_code: str | None = Field(default=None, max_length=128)
    template_variables: dict[str, Any] = Field(default_factory=dict)
    variable_bindings: dict[str, RecipientVariableBinding] = Field(default_factory=dict)
    i18n_key: str | None = Field(default=None, max_length=256)
    i18n_params: dict[str, Any] = Field(default_factory=dict)
    localized_content: LocalizedContent | None = None
    raw_title: str | None = Field(default=None, max_length=256)
    raw_content: str | None = None
    raw_format: ContentFormat = "plain_text"
    audience: list[AudienceRuleIn] = Field(default_factory=list)
    mandatory: bool = False
    channels: list[NotificationChannel] = Field(
        default_factory=_in_app_channels,
    )
    action: ActionIn | None = None
    publish_at: datetime | None = None
    expire_at: datetime | None = None
    save_as_draft: bool = False

    @field_validator("publish_at", "expire_at")
    @classmethod
    def _utc_for_storage(cls, value: datetime | None) -> datetime | None:
        return timezone.to_utc(value).replace(tzinfo=None) if value is not None else None

    @model_validator(mode="after")
    def _validate_content_source(self) -> "AnnouncementCreateRequest":
        """Apply the shared command contract before entering create or edit routes."""
        if self.display_mode == "top_banner" and self.variable_bindings:
            raise ValueError("top banner does not support recipient variables")
        if self.display_mode == "inbox" and not self.audience:
            raise ValueError("inbox audience cannot be empty")
        payload = self.model_dump(
            exclude={
                "publish_at",
                "expire_at",
                "save_as_draft",
                "display_mode",
                "client_request_id",
                "banner_revision",
                "replace_current",
                "replace_scheduled",
            }
        )
        if self.display_mode == "top_banner":
            payload.update(audience=[{"type": "all"}], channels=["in_app"])
        NotificationCommand.model_validate(
            {
                "source": "admin",
                **payload,
            }
        )
        return self


class ContentPreviewRequest(BaseRequest):
    template_code: str = Field(min_length=1, max_length=128)
    template_variables: dict[str, Any] = Field(default_factory=dict)
    variable_bindings: dict[str, RecipientVariableBinding] = Field(default_factory=dict)
    audience: list[AudienceRuleIn] = Field(min_length=1)
    preview_user_id: UUID | None = None


class ContentPreviewResponse(BaseModel):
    content_mode: TemplateContentMode
    title: str
    content: str
    content_params: dict[str, Any] | None = None
    content_format: ContentFormat | None = None


class AudiencePreviewRequest(BaseRequest):
    audience: list[AudienceRuleIn] = Field(min_length=1)


class AudiencePreviewResponse(BaseModel):
    total: int
    by_type: dict[str, int] = Field(default_factory=dict)


AnnouncementUpdateRequest = AnnouncementCreateRequest


class MessageAdminResponse(BaseSchema):
    create_time: UTCInstant
    update_time: UTCInstant
    display_mode: Literal["inbox", "top_banner"] = "inbox"
    superseded_at: UTCInstant | None = None
    superseded_by_id: UUID | None = None
    source: str
    category: str
    level: NotificationLevel
    content_mode: str
    title: str
    content: str
    status: MessageStatus
    mandatory: bool
    publish_at: UTCInstant | None = None
    published_at: UTCInstant | None = None
    expire_at: UTCInstant | None = None
    recalled_at: UTCInstant | None = None
    cancelled_at: UTCInstant | None = None


class MessageAdminDetailResponse(MessageAdminResponse):
    variable_bindings: dict[str, RecipientVariableBinding] = Field(default_factory=dict)
    content_params: dict[str, Any] | None = None
    content_format: ContentFormat | None = None
    channels: list[NotificationChannel]
    action: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None
    template_id: UUID | None = None
    template_code: str | None = None
    audiences: list[AudienceRuleIn]

    publish_at: EditableInstant | None = None
    expire_at: EditableInstant | None = None


class MessageListQuery(PaginatedRequest):
    display_mode: Literal["inbox", "top_banner"] | None = None
    status: MessageStatus | None = None
    category: str | None = Field(default=None, max_length=128)


class DeliveryRecipientResponse(BaseModel):
    name: str = ""
    username: str = ""
    avatar: str | None = None
    department: str = ""
    state: Literal["active", "disabled", "pending", "deleted"] = "deleted"


class DeliveryMessageResponse(BaseModel):
    id: UUID
    title: str
    category: str
    content_mode: str
    title_params: dict[str, Any] | None = None
    titles: dict[str, str] = Field(default_factory=dict)
    default_locale: str | None = None
    status: MessageStatus
    published_at: UTCInstant | None = None
    expire_at: UTCInstant | None = None
    create_time: UTCInstant


class DeliveryResponse(BaseSchema):
    create_time: UTCInstant
    update_time: UTCInstant
    message_id: UUID
    user_id: UUID
    channel: NotificationChannel
    status: OutboxStatus
    attempt_count: int
    last_error_code: str | None = None
    next_attempt_at: UTCInstant | None = None
    locked_until: UTCInstant | None = None
    sent_at: UTCInstant | None = None
    recipient: DeliveryRecipientResponse = Field(default_factory=DeliveryRecipientResponse)
    message: DeliveryMessageResponse | None = None


class DeliverySummaryResponse(BaseModel):
    message_id: UUID
    by_status: dict[str, int] = Field(default_factory=dict)
    message: DeliveryMessageResponse | None = None


class DeliveryListQuery(PaginatedRequest):
    message_id: UUID | None = None
    status: OutboxStatus | None = None


class AnnouncementCreatedResponse(BaseModel):
    message_id: UUID


class AnnouncementPublishedResponse(BaseModel):
    recipient_count: int


class DeliveryRetryResponse(BaseModel):
    retried: int
