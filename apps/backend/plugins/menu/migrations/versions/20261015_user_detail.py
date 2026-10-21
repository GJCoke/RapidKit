"""Register the hidden user detail page without replacing customized routes."""

import sqlalchemy as sa
from alembic import op

revision = "menu_detail_20261015"
down_revision = "a7c4e2d91b60"
branch_labels = None
depends_on = None

# A fixed UUID7 identifies only the row owned by this data migration.
DETAIL_ID = "01a13f7c-3d5b-77f4-853e-b7aa0d399b92"


def upgrade() -> None:
    op.execute(
        sa.text(rf"""
        INSERT INTO menu_menus (
            id, create_time, update_time, menu_name, menu_type, "order",
            route_name, route_path, component, icon_type, status,
            hide_in_menu, parent_id, i18n_key, keep_alive, constant,
            multi_tab, query, buttons, interfaces
        )
        SELECT '{DETAIL_ID}'::uuid, CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC', '用户详情', 'MENU', 1,
            'manage_user-detail', '/manage/user-detail/\:id', 'view.manage_user-detail',
            'ICONIFY', 'ON', true, id, 'route.manage_user-detail', false, false,
            false, '[]'::json, '[]'::json, '["GET:/api/v1/users/{{user_id}}"]'::json
        FROM menu_menus WHERE route_name = 'manage'
        ON CONFLICT DO NOTHING
    """)
    )


def downgrade() -> None:
    op.execute(
        sa.text(rf"""
        DELETE FROM menu_menus
        WHERE id = '{DETAIL_ID}'::uuid AND route_name = 'manage_user-detail'
    """)
    )
