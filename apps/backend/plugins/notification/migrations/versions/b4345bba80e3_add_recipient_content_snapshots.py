"""add recipient content snapshots

Revision ID: b4345bba80e3
Revises: 91bb8dbd2d31
Create Date: 2026-10-09 19:22:21.905892

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4345bba80e3"
down_revision: Union[str, None] = "91bb8dbd2d31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def upgrade() -> None:
    """Add nullable snapshots, allowing an already-applied local schema repair."""
    if not _has_column("notification_messages", "personalization"):
        op.add_column("notification_messages", sa.Column("personalization", sa.JSON(), nullable=True))
    if not _has_column("notification_user_notifications", "rendered_content"):
        op.add_column("notification_user_notifications", sa.Column("rendered_content", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove only recipient configuration and content snapshot columns."""
    if _has_column("notification_user_notifications", "rendered_content"):
        op.drop_column("notification_user_notifications", "rendered_content")
    if _has_column("notification_messages", "personalization"):
        op.drop_column("notification_messages", "personalization")
