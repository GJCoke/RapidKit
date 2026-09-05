"""通知插件 —— 收件箱 API schema。"""

from uuid import UUID

from pydantic import Field
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest
from rapidkit_common.schemas.types import LocalDatetime


class InboxListQuery(BaseRequest):
    """收件箱游标分页查询。"""

    cursor: UUID | None = None
    size: int = Field(default=20, ge=1, le=100)
    unread_only: bool = False
    include_archived: bool = False


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
