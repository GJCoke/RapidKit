"""Cross-plugin contracts for the notification system.

Business plugins depend only on this module's ``Notifier`` protocol and
``NotificationCommand``; they never import notification plugin internals.
"""

from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

NotificationLevel = Literal["info", "success", "warning", "error"]
AudienceType = Literal["user", "role", "department", "all"]
ContentMode = Literal["i18n", "raw"]
ContentFormat = Literal["plain_text", "markdown"]
NotificationChannel = Literal["in_app"]


def _default_channels() -> list[NotificationChannel]:
    return ["in_app"]


class NotificationAction(BaseModel):
    """A controlled in-app navigation target, never a constructed URL."""

    route: str = Field(..., min_length=1, max_length=128)
    params: dict = Field(default_factory=dict)
    label: str | None = Field(default=None, max_length=64)


class AudienceRule(BaseModel):
    """A single audience rule for user, role, department, or all users."""

    type: AudienceType
    value: str | None = None
    include_descendants: bool = False


class NotificationCommand(BaseModel):
    """The normalized notification command submitted by a business plugin."""

    source: str = Field(..., min_length=1, max_length=64)
    category: str = Field(..., min_length=1, max_length=128)
    level: NotificationLevel = "info"

    i18n_key: str | None = Field(default=None, max_length=256)
    i18n_params: dict = Field(default_factory=dict)

    raw_title: str | None = Field(default=None, max_length=256)
    raw_content: str | None = None
    raw_format: ContentFormat = "plain_text"

    audience: list[AudienceRule] = Field(default_factory=list)
    mandatory: bool = False
    channels: list[NotificationChannel] = Field(default_factory=_default_channels)
    action: NotificationAction | None = None

    deduplication_key: str | None = Field(default=None, max_length=256)
    meta: dict | None = None

    @property
    def content_mode(self) -> ContentMode:
        return "i18n" if self.i18n_key is not None else "raw"

    @model_validator(mode="after")
    def _validate(self) -> NotificationCommand:
        has_i18n = self.i18n_key is not None
        has_raw = self.raw_title is not None or self.raw_content is not None
        if has_i18n and has_raw:
            raise ValueError("content sources are mutually exclusive: provide either i18n or raw, not both")
        if not has_i18n and not has_raw:
            raise ValueError("missing content source: provide either i18n_key or raw_title+raw_content")
        if has_raw and (self.raw_title is None or self.raw_content is None):
            raise ValueError("raw mode requires both raw_title and raw_content")
        if not self.audience:
            raise ValueError("audience must not be empty")
        if not self.channels:
            raise ValueError("channels must not be empty")
        return self


class NotificationResult(BaseModel):
    """The result of processing a notification command."""

    message_id: UUID
    recipient_count: int
    deduplicated: bool = False


@runtime_checkable
class Notifier(Protocol):
    """The notification service protocol provided by plugin_notification."""

    async def send(self, command: NotificationCommand) -> NotificationResult: ...
