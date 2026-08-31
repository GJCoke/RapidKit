"""Add the set-password module to the login route.

Revision ID: 6f3a9c2d1e4b
Revises: cad2361eba44
Create Date: 2026-08-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6f3a9c2d1e4b"
down_revision: str | None = "cad2361eba44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_LOGIN_PATH = "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat)?"
NEW_LOGIN_PATH = "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat|set-password)?"

menu_menus = sa.table(
    "menu_menus",
    sa.column("route_name", sa.String()),
    sa.column("route_path", sa.String()),
)


def upgrade() -> None:
    """Allow invite links to open the set-password login module."""
    op.get_bind().execute(
        sa.update(menu_menus)
        .where(menu_menus.c.route_name == "login", menu_menus.c.route_path == OLD_LOGIN_PATH)
        .values(route_path=NEW_LOGIN_PATH)
    )


def downgrade() -> None:
    """Restore the login route used before invite password setup."""
    op.get_bind().execute(
        sa.update(menu_menus)
        .where(menu_menus.c.route_name == "login", menu_menus.c.route_path == NEW_LOGIN_PATH)
        .values(route_path=OLD_LOGIN_PATH)
    )
