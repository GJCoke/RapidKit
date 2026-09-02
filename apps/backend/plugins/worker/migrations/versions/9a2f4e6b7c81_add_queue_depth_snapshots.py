"""add queue depth snapshots

Revision ID: 9a2f4e6b7c81
Revises: 1663b0955ade
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9a2f4e6b7c81"
down_revision: str | None = "b4efa9f81f0d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "worker_queue_depth_snapshots",
        sa.Column("sampled_at", sa.DateTime(), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_worker_queue_depth_snapshots_created_by"), "worker_queue_depth_snapshots", ["created_by"])
    op.create_index(op.f("ix_worker_queue_depth_snapshots_id"), "worker_queue_depth_snapshots", ["id"])
    op.create_index(op.f("ix_worker_queue_depth_snapshots_sampled_at"), "worker_queue_depth_snapshots", ["sampled_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_worker_queue_depth_snapshots_sampled_at"), table_name="worker_queue_depth_snapshots")
    op.drop_index(op.f("ix_worker_queue_depth_snapshots_id"), table_name="worker_queue_depth_snapshots")
    op.drop_index(op.f("ix_worker_queue_depth_snapshots_created_by"), table_name="worker_queue_depth_snapshots")
    op.drop_table("worker_queue_depth_snapshots")
