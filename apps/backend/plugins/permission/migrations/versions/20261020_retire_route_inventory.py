"""Retire the route inventory and its permission code.

Revision ID: 20261020_route_inventory
Revises: None
"""

import sqlalchemy as sa
from alembic import op

revision = "20261020_route_inventory"
down_revision = None
branch_labels = ("permission",)
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    tables = sa.inspect(connection).get_table_names()
    if "permission_routers" in tables:
        op.drop_table("permission_routers")
    if "permission_roles" not in tables:
        return
    roles = sa.Table("permission_roles", sa.MetaData(), autoload_with=connection)
    if "permission_codes" not in roles.c:
        return
    for role_id, codes in connection.execute(sa.select(roles.c.id, roles.c.permission_codes)):
        if codes and "api-route:read" in codes:
            connection.execute(
                roles.update()
                .where(roles.c.id == role_id)
                .values(permission_codes=[code for code in codes if code != "api-route:read"])
            )


def downgrade() -> None:
    if "permission_routers" in sa.inspect(op.get_bind()).get_table_names():
        return
    # The old application rebuilds route inventory rows on startup.
    op.create_table(
        "permission_routers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("methods", sa.JSON(), nullable=True),
    )
    op.create_index("ix_permission_routers_id", "permission_routers", ["id"])
    op.create_index("ix_permission_routers_created_by", "permission_routers", ["created_by"])
