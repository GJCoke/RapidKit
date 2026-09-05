"""init notification

Revision ID: a7d3c9f1e4b2
Revises:
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "a7d3c9f1e4b2"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = ("notification",)
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("source", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("category", sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column("level", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("content_mode", sqlmodel.sql.sqltypes.AutoString(length=8), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=256), nullable=False),
        sa.Column("content", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("content_params", sa.JSON(), nullable=True),
        sa.Column("content_format", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=True),
        sa.Column("mandatory", sa.Boolean(), nullable=False),
        sa.Column("channels", sa.JSON(), nullable=True),
        sa.Column("action", sa.JSON(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("deduplication_key", sqlmodel.sql.sqltypes.AutoString(length=256), nullable=True),
        sa.Column("correlation_id", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "deduplication_key", name="uq_notification_messages_source_dedup"),
    )
    op.create_index(op.f("ix_notification_messages_created_by"), "notification_messages", ["created_by"])
    op.create_index(op.f("ix_notification_messages_id"), "notification_messages", ["id"])
    op.create_index(op.f("ix_notification_messages_source"), "notification_messages", ["source"])
    op.create_index(op.f("ix_notification_messages_category"), "notification_messages", ["category"])
    op.create_index(op.f("ix_notification_messages_status"), "notification_messages", ["status"])
    op.create_index(op.f("ix_notification_messages_correlation_id"), "notification_messages", ["correlation_id"])

    op.create_table(
        "notification_audiences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("audience_type", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("audience_value", sqlmodel.sql.sqltypes.AutoString(length=256), nullable=True),
        sa.Column("include_descendants", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notification_audiences_created_by"), "notification_audiences", ["created_by"])
    op.create_index(op.f("ix_notification_audiences_id"), "notification_audiences", ["id"])
    op.create_index(op.f("ix_notification_audiences_message_id"), "notification_audiences", ["message_id"])

    op.create_table(
        "notification_user_notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "user_id", name="uq_notification_user_notifications_msg_user"),
    )
    op.create_index(
        op.f("ix_notification_user_notifications_created_by"),
        "notification_user_notifications",
        ["created_by"],
    )
    op.create_index(op.f("ix_notification_user_notifications_id"), "notification_user_notifications", ["id"])
    op.create_index(
        op.f("ix_notification_user_notifications_message_id"),
        "notification_user_notifications",
        ["message_id"],
    )
    op.create_index(
        op.f("ix_notification_user_notifications_user_id"),
        "notification_user_notifications",
        ["user_id"],
    )

    op.create_table(
        "notification_outbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("channel", sqlmodel.sql.sqltypes.AutoString(length=32), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("idempotency_key", sqlmodel.sql.sqltypes.AutoString(length=256), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("last_error_code", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.Column("locked_by", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_notification_outbox_idempotency"),
    )
    op.create_index(op.f("ix_notification_outbox_created_by"), "notification_outbox", ["created_by"])
    op.create_index(op.f("ix_notification_outbox_id"), "notification_outbox", ["id"])
    op.create_index(op.f("ix_notification_outbox_message_id"), "notification_outbox", ["message_id"])
    op.create_index(op.f("ix_notification_outbox_user_id"), "notification_outbox", ["user_id"])
    op.create_index(op.f("ix_notification_outbox_status"), "notification_outbox", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_notification_outbox_status"), table_name="notification_outbox")
    op.drop_index(op.f("ix_notification_outbox_user_id"), table_name="notification_outbox")
    op.drop_index(op.f("ix_notification_outbox_message_id"), table_name="notification_outbox")
    op.drop_index(op.f("ix_notification_outbox_id"), table_name="notification_outbox")
    op.drop_index(op.f("ix_notification_outbox_created_by"), table_name="notification_outbox")
    op.drop_table("notification_outbox")

    op.drop_index(op.f("ix_notification_user_notifications_user_id"), table_name="notification_user_notifications")
    op.drop_index(op.f("ix_notification_user_notifications_message_id"), table_name="notification_user_notifications")
    op.drop_index(op.f("ix_notification_user_notifications_id"), table_name="notification_user_notifications")
    op.drop_index(op.f("ix_notification_user_notifications_created_by"), table_name="notification_user_notifications")
    op.drop_table("notification_user_notifications")

    op.drop_index(op.f("ix_notification_audiences_message_id"), table_name="notification_audiences")
    op.drop_index(op.f("ix_notification_audiences_id"), table_name="notification_audiences")
    op.drop_index(op.f("ix_notification_audiences_created_by"), table_name="notification_audiences")
    op.drop_table("notification_audiences")

    op.drop_index(op.f("ix_notification_messages_correlation_id"), table_name="notification_messages")
    op.drop_index(op.f("ix_notification_messages_status"), table_name="notification_messages")
    op.drop_index(op.f("ix_notification_messages_category"), table_name="notification_messages")
    op.drop_index(op.f("ix_notification_messages_source"), table_name="notification_messages")
    op.drop_index(op.f("ix_notification_messages_id"), table_name="notification_messages")
    op.drop_index(op.f("ix_notification_messages_created_by"), table_name="notification_messages")
    op.drop_table("notification_messages")
