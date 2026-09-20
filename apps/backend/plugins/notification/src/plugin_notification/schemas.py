"""通知插件 —— 收件箱 API schema。"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest
from rapidkit_common.schemas.types import LocalDatetime


class InboxListQuery(BaseRequest):
    """收件箱游标分页查询。"""

    cursor: UUID | None = None
    size: int = Field(default=20, ge=1, le=100)
    unread_only: bool = False
    archived: Literal["active", "archived", "all"] = "active"
    category: str | None = Field(default=None, max_length=128)
    level: Literal["info", "success", "warning", "error"] | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None

    @model_validator(mode="after")
    def _validate_time_range(self) -> "InboxListQuery":
        if self.created_from is not None and self.created_to is not None and self.created_from > self.created_to:
            raise ValueError("created_from must not be later than created_to")
        return self


class NotificationItem(BaseModel):
    """一条当前用户可见的站内通知。"""

    id: UUID
    message_id: UUID
    content_mode: str
    title: str
    content: str
    content_params: dict | None = None
    content_format: str | None = None
    level: str
    category: str
    mandatory: bool
    action: dict | None = None
    status: str
    expire_at: LocalDatetime | None = None
    recalled_at: LocalDatetime | None = None
    read_at: LocalDatetime | None = None
    archived_at: LocalDatetime | None = None
    create_time: LocalDatetime


class InboxPage(BaseModel):
    """收件箱游标分页响应。"""

    items: list[NotificationItem]
    next_cursor: UUID | None = None
    size: int


class UnreadCount(BaseModel):
    """当前用户未读通知数。"""

    count: int
