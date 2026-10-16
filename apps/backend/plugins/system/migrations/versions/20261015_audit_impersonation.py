"""Add nullable impersonation attribution to existing audit records."""

import sqlalchemy as sa
from alembic import op

revision = "sys_imp_20261015"
down_revision = "95adc77af4f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ("subject_user_id", "impersonation_session_id"):
        op.add_column("system_audit_logs", sa.Column(column, sa.Uuid(), nullable=True))
        op.create_index(f"ix_system_audit_logs_{column}", "system_audit_logs", [column])


def downgrade() -> None:
    for column in ("impersonation_session_id", "subject_user_id"):
        op.drop_index(f"ix_system_audit_logs_{column}", table_name="system_audit_logs")
        op.drop_column("system_audit_logs", column)
