"""Index objects affected by batch audit operations.

Revision ID: 20261021_audit_targets
Revises: 20261021_audit_v2
"""

import sqlalchemy as sa
from alembic import op

revision = "20261021_audit_targets"
down_revision = "20261021_audit_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_audit_log_targets",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("audit_log_id", sa.Uuid(), sa.ForeignKey("system_audit_logs.id"), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=False),
        sa.Column("resource_name", sa.String(200), nullable=True),
        sa.Column("result", sa.String(7), nullable=False),
        sa.Column("error_message", sa.String(1024), nullable=True),
    )
    op.create_index("ix_system_audit_log_targets_id", "system_audit_log_targets", ["id"])
    op.create_index("ix_system_audit_log_targets_created_by", "system_audit_log_targets", ["created_by"])
    op.create_index("ix_system_audit_log_targets_audit_log_id", "system_audit_log_targets", ["audit_log_id"])
    op.create_index(
        "ix_audit_target_resource", "system_audit_log_targets", ["resource_type", "resource_id", "audit_log_id"]
    )


def downgrade() -> None:
    raise RuntimeError("Keep audit targets when rolling back application code")
