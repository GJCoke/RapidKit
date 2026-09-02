"""split audit and activity tables

Revision ID: 9c6f2d4a8b10
Revises: f974c27c69af
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9c6f2d4a8b10"
down_revision: str | None = "f974c27c69af"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _base_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    op.rename_table("system_activity_logs", "system_activity_logs_legacy")
    op.create_table(
        "system_audit_logs",
        *_base_columns(),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("resource_name", sa.String(200), nullable=True),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("request_id", sa.String(100), nullable=True),
        sa.Column("correlation_id", sa.String(100), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("http_method", sa.String(10), nullable=True),
        sa.Column("path", sa.String(500), nullable=True),
        sa.Column("request_summary", sa.JSON(), nullable=True),
        sa.Column("response_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.String(1024), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "system_activity_events",
        *_base_columns(),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("event_code", sa.String(100), nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("subject_type", sa.String(50), nullable=False),
        sa.Column("subject_id", sa.String(100), nullable=True),
        sa.Column("subject_name", sa.String(200), nullable=True),
        sa.Column("title_key", sa.String(150), nullable=False),
        sa.Column("title_params", sa.JSON(), nullable=False),
        sa.Column("description_key", sa.String(150), nullable=True),
        sa.Column("description_params", sa.JSON(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("source_event_id", sa.String(64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_event_id", name="uq_system_activity_source_event_id"),
    )
    op.create_index("ix_system_activity_events_occurred_at", "system_activity_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_system_activity_events_occurred_at", table_name="system_activity_events")
    op.drop_table("system_activity_events")
    op.drop_table("system_audit_logs")
    op.rename_table("system_activity_logs_legacy", "system_activity_logs")
