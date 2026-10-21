"""Add global banner lifecycle and its migration-seeded singleton lock.

Revision ID: d73a2bf8c619
Revises: b4345bba80e3
"""

from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision = "d73a2bf8c619"
down_revision = "b4345bba80e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification_messages", sa.Column("display_mode", sa.String(16), server_default="inbox", nullable=False)
    )
    op.add_column("notification_messages", sa.Column("superseded_at", sa.DateTime(), nullable=True))
    op.add_column("notification_messages", sa.Column("superseded_by_id", sa.Uuid(), nullable=True))
    state = op.create_table(
        "notification_banner_state",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("active_message_id", sa.Uuid(), nullable=True),
        sa.Column("scheduled_message_id", sa.Uuid(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_banner_state_id", "notification_banner_state", ["id"])
    op.create_index("ix_notification_banner_state_created_by", "notification_banner_state", ["created_by"])
    # Database clock avoids importing application settings inside a migration.
    op.execute(
        state.insert().values(
            id=UUID("00000000-0000-7000-8000-000000000001"),
            create_time=sa.func.current_timestamp(),
            update_time=sa.func.current_timestamp(),
            revision=0,
        )
    )


def downgrade() -> None:
    op.drop_index("ix_notification_banner_state_created_by", table_name="notification_banner_state")
    op.drop_index("ix_notification_banner_state_id", table_name="notification_banner_state")
    op.drop_table("notification_banner_state")
    op.drop_column("notification_messages", "superseded_by_id")
    op.drop_column("notification_messages", "superseded_at")
    op.drop_column("notification_messages", "display_mode")
