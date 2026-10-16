"""add active menu binding

Revision ID: a7c4e2d91b60
Revises: 36651db94ff2
Create Date: 2026-09-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c4e2d91b60"
down_revision: str | None = "36651db94ff2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = "2e5a512af7c0"

ACTIVE_MENU_OPTIONS_PERMISSION = "GET:/api/v1/manage/menus/active-menu-options"
MENU_LIST_PERMISSION = "GET:/api/v1/manage/menus"


def upgrade() -> None:
    """Add the optional self-reference used by hidden child pages."""
    op.add_column("menu_menus", sa.Column("active_menu_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_menu_menus_active_menu_id"),
        "menu_menus",
        ["active_menu_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_menu_menus_active_menu_id_menu_menus",
        "menu_menus",
        "menu_menus",
        ["active_menu_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        sa.text(
            f"""
            UPDATE menu_menus
            SET interfaces = (
                COALESCE(interfaces, '[]'::json)::jsonb
                || '["{ACTIVE_MENU_OPTIONS_PERMISSION}"]'::jsonb
            )::json
            WHERE route_name = 'manage_menu'
              AND NOT (
                  COALESCE(interfaces, '[]'::json)::jsonb
                  @> '["{ACTIVE_MENU_OPTIONS_PERMISSION}"]'::jsonb
              )
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            DO $$
            BEGIN
                IF to_regclass('public.permission_roles') IS NOT NULL THEN
                    EXECUTE $sql$
                        UPDATE permission_roles
                        SET interface_permissions = (
                            COALESCE(interface_permissions, '[]'::json)::jsonb
                            || '["{ACTIVE_MENU_OPTIONS_PERMISSION}"]'::jsonb
                        )::json
                        WHERE COALESCE(interface_permissions, '[]'::json)::jsonb
                                  @> '["{MENU_LIST_PERMISSION}"]'::jsonb
                          AND NOT (
                              COALESCE(interface_permissions, '[]'::json)::jsonb
                              @> '["{ACTIVE_MENU_OPTIONS_PERMISSION}"]'::jsonb
                          )
                    $sql$;
                END IF;
            END $$
            """
        )
    )


def downgrade() -> None:
    """Remove the hidden-page sidebar binding."""
    op.execute(
        sa.text(
            f"""
            DO $$
            BEGIN
                IF to_regclass('public.permission_roles') IS NOT NULL THEN
                    EXECUTE $sql$
                        UPDATE permission_roles
                        SET interface_permissions = COALESCE(
                            (
                                SELECT jsonb_agg(value)
                                FROM jsonb_array_elements(
                                    COALESCE(permission_roles.interface_permissions, '[]'::json)::jsonb
                                ) AS value
                                WHERE value <> to_jsonb('{ACTIVE_MENU_OPTIONS_PERMISSION}'::text)
                            ),
                            '[]'::jsonb
                        )::json
                        WHERE COALESCE(interface_permissions, '[]'::json)::jsonb
                                  @> '["{ACTIVE_MENU_OPTIONS_PERMISSION}"]'::jsonb
                    $sql$;
                END IF;
            END $$
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            UPDATE menu_menus
            SET interfaces = COALESCE(
                (
                    SELECT jsonb_agg(value)
                    FROM jsonb_array_elements(COALESCE(menu_menus.interfaces, '[]'::json)::jsonb) AS value
                    WHERE value <> to_jsonb('{ACTIVE_MENU_OPTIONS_PERMISSION}'::text)
                ),
                '[]'::jsonb
            )::json
            WHERE route_name = 'manage_menu'
            """
        )
    )
    op.drop_constraint(
        "fk_menu_menus_active_menu_id_menu_menus",
        "menu_menus",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_menu_menus_active_menu_id"), table_name="menu_menus")
    op.drop_column("menu_menus", "active_menu_id")
