"""Add persistent impersonation sessions (independent auth branch)."""

import sqlalchemy as sa
from alembic import op

revision = "auth_imp_20261015"
down_revision = None
branch_labels = ("auth",)
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_impersonation_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("subject_user_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("end_reason", sa.String(30), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("id", "created_by", "actor_id", "subject_user_id", "expires_at", "ended_at"):
        op.create_index(f"ix_auth_impersonation_sessions_{column}", "auth_impersonation_sessions", [column])
    op.create_index(
        "uq_auth_impersonation_active_actor",
        "auth_impersonation_sessions",
        ["actor_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_auth_impersonation_active_actor", table_name="auth_impersonation_sessions")
    for column in ("ended_at", "expires_at", "subject_user_id", "actor_id", "created_by", "id"):
        op.drop_index(f"ix_auth_impersonation_sessions_{column}", table_name="auth_impersonation_sessions")
    op.drop_table("auth_impersonation_sessions")
