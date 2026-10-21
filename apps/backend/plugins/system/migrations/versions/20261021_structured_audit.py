"""Add structured audit fields without rewriting historical events.

Revision ID: 20261021_audit_v2
Revises: sys_imp_20261015
"""

import sqlalchemy as sa
from alembic import op

revision = "20261021_audit_v2"
down_revision = "sys_imp_20261015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    if "system_audit_logs" not in sa.inspect(connection).get_table_names():
        raise RuntimeError("Initialize the existing system tables before applying audit v2")
    op.add_column("system_audit_logs", sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("system_audit_logs", sa.Column("actor_type", sa.String(9), nullable=False, server_default="unknown"))
    op.add_column("system_audit_logs", sa.Column("actor_username", sa.String(100), nullable=True))
    op.add_column("system_audit_logs", sa.Column("business_code", sa.Integer(), nullable=True))
    op.add_column("system_audit_logs", sa.Column("error_key", sa.String(150), nullable=True))
    op.add_column("system_audit_logs", sa.Column("duration_ms", sa.Float(), nullable=True))
    op.create_index("ix_audit_time_id", "system_audit_logs", ["occurred_at", "id"])
    op.create_index(
        "ix_audit_resource_time_id", "system_audit_logs", ["resource_type", "resource_id", "occurred_at", "id"]
    )
    op.create_index("ix_audit_actor_time_id", "system_audit_logs", ["actor_id", "occurred_at", "id"])


def downgrade() -> None:
    # New result values and snapshots cannot be discarded safely during rollback.
    raise RuntimeError("Keep the compatible audit schema when rolling back application code")
