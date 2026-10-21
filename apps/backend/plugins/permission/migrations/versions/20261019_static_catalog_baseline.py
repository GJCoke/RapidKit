"""Recognize the separately applied static permission catalog baseline.

Revision ID: perm_static_catalog_20261019
Revises: 2e5a512af7c0
"""

import sqlalchemy as sa
from alembic import op

revision = "perm_static_catalog_20261019"
down_revision = "2e5a512af7c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("permission_roles")}
    if "permission_codes" not in columns:
        raise RuntimeError("Apply the static permission catalog conversion before upgrading this legacy database")


def downgrade() -> None:
    raise RuntimeError("The static permission catalog conversion cannot be reverted without losing grants")
