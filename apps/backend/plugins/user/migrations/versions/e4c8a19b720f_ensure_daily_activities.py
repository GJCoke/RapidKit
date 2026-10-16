"""Ensure daily activities exist on older user databases.

Revision ID: e4c8a19b720f
Revises: adada539a1ca
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op

revision = "e4c8a19b720f"
down_revision = "adada539a1ca"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("user_daily_activities"):
        return
    op.create_table(
        "user_daily_activities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("activity_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_date", "user_id", name="uq_user_daily_activity_date_user"),
    )
    for column in ("activity_date", "created_by", "id", "user_id"):
        op.create_index(
            op.f(f"ix_user_daily_activities_{column}"),
            "user_daily_activities",
            [column],
            unique=False,
        )


def downgrade() -> None:
    # The initial migration already owns this table. Retain its data and schema.
    pass
