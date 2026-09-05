"""通知插件 —— ORM 模型。"""

from datetime import datetime
from uuid import UUID

from rapidkit_common.models import SQLModel
from sqlalchemy import JSON, Column, DateTime, UniqueConstraint
from sqlmodel import Field


class NotificationMessage(SQLModel, table=True):
    """一条待投递或已发布的通知内容。"""

    __tablename__ = "notification_messages"
    __table_args__ = (
        UniqueConstraint("source", "deduplication_key", name="uq_notification_messages_source_dedup"),
    )

    source: str = Field(max_length=64, index=True)
    category: str = Field(max_length=128, index=True)
    level: str = Field(max_length=16, default="info")

    content_mode: str = Field(max_length=8)
    title: str = Field(max_length=256)
    content: str = Field()
    content_params: dict | None = Field(default=None, sa_column=Column(JSON))
    content_format: str | None = Field(default=None, max_length=16)

    mandatory: bool = Field(default=False)
    channels: list = Field(default_factory=list, sa_column=Column(JSON))
    action: dict | None = Field(default=None, sa_column=Column(JSON))
    meta: dict | None = Field(default=None, sa_column=Column(JSON))

    status: str = Field(max_length=16, default="publishing", index=True)
    deduplication_key: str | None = Field(default=None, max_length=256)
    correlation_id: str = Field(max_length=64, index=True)


class NotificationAudience(SQLModel, table=True):
    """通知创建时保存的受众规则快照。"""

    __tablename__ = "notification_audiences"

    message_id: UUID = Field(index=True)
    audience_type: str = Field(max_length=16)
    audience_value: str | None = Field(default=None, max_length=256)
    include_descendants: bool = Field(default=False)


class UserNotification(SQLModel, table=True):
    """用户收件箱记录。"""

    __tablename__ = "notification_user_notifications"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_notification_user_notifications_msg_user"),
    )

    message_id: UUID = Field(index=True)
    user_id: UUID = Field(index=True)
    read_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))
    archived_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))
    deleted_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))
    delivered_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))


class NotificationOutbox(SQLModel, table=True):
    """Transactional Outbox 中的一次渠道投递。"""

    __tablename__ = "notification_outbox"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_notification_outbox_idempotency"),
    )

    message_id: UUID = Field(index=True)
    user_id: UUID = Field(index=True)
    channel: str = Field(max_length=32)
    status: str = Field(max_length=16, default="pending", index=True)
    idempotency_key: str = Field(max_length=256)
    attempt_count: int = Field(default=0)
    last_error_code: str | None = Field(default=None, max_length=64)
    locked_by: str | None = Field(default=None, max_length=64)
    next_attempt_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))
    locked_until: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))
    sent_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=False), nullable=True))
