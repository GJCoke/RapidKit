"""Contract tests for the active-menu binding migration."""

from importlib import import_module
from unittest.mock import patch

MIGRATION = "plugins.menu.migrations.versions.a7c4e2d91b60_add_active_menu_binding"


def test_migration_orders_role_backfill_after_permission_roles_table():
    migration = import_module(MIGRATION)
    assert migration.depends_on == "2e5a512af7c0"


def test_upgrade_adds_active_menu_column_index_and_foreign_key():
    migration = import_module(MIGRATION)
    with (
        patch.object(migration.op, "f", side_effect=lambda name: name),
        patch.object(migration.op, "add_column") as add_column,
        patch.object(migration.op, "create_index") as create_index,
        patch.object(migration.op, "create_foreign_key") as create_foreign_key,
        patch.object(migration.op, "execute") as execute,
    ):
        migration.upgrade()

    assert add_column.call_args.args[0] == "menu_menus"
    assert add_column.call_args.args[1].name == "active_menu_id"
    create_index.assert_called_once_with(
        "ix_menu_menus_active_menu_id",
        "menu_menus",
        ["active_menu_id"],
        unique=False,
    )
    create_foreign_key.assert_called_once_with(
        "fk_menu_menus_active_menu_id_menu_menus",
        "menu_menus",
        "menu_menus",
        ["active_menu_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    sql = "\n".join(str(call.args[0]) for call in execute.call_args_list)
    assert "GET:/api/v1/manage/menus/active-menu-options" in sql
    assert "manage_menu" in sql
    assert "permission_roles" in sql
    assert "GET:/api/v1/manage/menus" in sql
    assert "to_regclass" in sql


def test_downgrade_removes_foreign_key_index_and_column():
    migration = import_module(MIGRATION)
    with (
        patch.object(migration.op, "f", side_effect=lambda name: name),
        patch.object(migration.op, "drop_constraint") as drop_constraint,
        patch.object(migration.op, "drop_index") as drop_index,
        patch.object(migration.op, "drop_column") as drop_column,
        patch.object(migration.op, "execute") as execute,
    ):
        migration.downgrade()

    drop_constraint.assert_called_once_with(
        "fk_menu_menus_active_menu_id_menu_menus",
        "menu_menus",
        type_="foreignkey",
    )
    drop_index.assert_called_once_with(
        "ix_menu_menus_active_menu_id",
        table_name="menu_menus",
    )
    drop_column.assert_called_once_with("menu_menus", "active_menu_id")
    sql = "\n".join(str(call.args[0]) for call in execute.call_args_list)
    assert "GET:/api/v1/manage/menus/active-menu-options" in sql
    assert "manage_menu" in sql
    assert "permission_roles" in sql
    assert "to_regclass" in sql
