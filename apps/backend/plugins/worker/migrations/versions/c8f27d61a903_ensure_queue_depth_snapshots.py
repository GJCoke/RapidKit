"""Ensure queue-depth snapshots exist on older worker databases.

Revision ID: c8f27d61a903
Revises: 453adcbe32a4
Create Date: 2026-10-08

The regenerated initial migration already includes this table. Older databases
still have worker/task tables without it; repair only the missing snapshot table.
"""

import sqlalchemy as sa
from alembic import op

revision = "c8f27d61a903"
down_revision = "453adcbe32a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("worker_queue_depth_snapshots"):
        return
    op.create_table(
        "worker_queue_depth_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("sampled_at", sa.DateTime(), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("created_by", "id", "sampled_at"):
        op.create_index(
            op.f(f"ix_worker_queue_depth_snapshots_{column}"),
            "worker_queue_depth_snapshots",
            [column],
            unique=False,
        )


def downgrade() -> None:
    # The predecessor already owns this table; removing it would break that
    # schema and discard captured metrics. This repair therefore retains it.
    pass
