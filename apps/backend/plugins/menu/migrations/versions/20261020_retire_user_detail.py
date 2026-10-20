"""Retire the built-in user detail menu.

Revision ID: 20261020_user_detail
Revises: None
"""

import sqlalchemy as sa
from alembic import op

revision = "20261020_user_detail"
down_revision = None
branch_labels = ("menu",)
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    if "menu_menus" not in sa.inspect(connection).get_table_names():
        return
    menus = sa.Table("menu_menus", sa.MetaData(), autoload_with=connection)
    for menu_id, parent_id in connection.execute(
        sa.select(menus.c.id, menus.c.parent_id).where(menus.c.route_name == "manage_user-detail")
    ):
        connection.execute(menus.update().where(menus.c.active_menu_id == menu_id).values(active_menu_id=None))
        connection.execute(menus.update().where(menus.c.parent_id == menu_id).values(parent_id=parent_id))
        connection.execute(menus.delete().where(menus.c.id == menu_id))


def downgrade() -> None:
    # The previous application's seed command recreates its built-in page.
    pass
