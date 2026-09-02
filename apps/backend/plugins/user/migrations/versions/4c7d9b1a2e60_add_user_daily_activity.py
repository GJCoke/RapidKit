"""add user daily activity

Revision ID: 4c7d9b1a2e60
Revises: bed0bf42a8fc
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4c7d9b1a2e60"
down_revision: str | None = "5b5adbb8f211"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_daily_activities",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("activity_date", sa.Date(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_date", "user_id", name="uq_user_daily_activity_date_user"),
    )
    op.create_index(op.f("ix_user_daily_activities_activity_date"), "user_daily_activities", ["activity_date"])
    op.create_index(op.f("ix_user_daily_activities_created_by"), "user_daily_activities", ["created_by"])
    op.create_index(op.f("ix_user_daily_activities_id"), "user_daily_activities", ["id"])
    op.create_index(op.f("ix_user_daily_activities_user_id"), "user_daily_activities", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_user_daily_activities_user_id"), table_name="user_daily_activities")
    op.drop_index(op.f("ix_user_daily_activities_id"), table_name="user_daily_activities")
    op.drop_index(op.f("ix_user_daily_activities_created_by"), table_name="user_daily_activities")
    op.drop_index(op.f("ix_user_daily_activities_activity_date"), table_name="user_daily_activities")
    op.drop_table("user_daily_activities")
