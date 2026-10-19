import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from plugin_menu.models import Menu
from sqlalchemy import inspect, text

PATH = Path(__file__).resolve().parents[1] / "plugins/menu/migrations/versions/20261017_menu_permission.py"
pytestmark = pytest.mark.skipif(not PATH.is_file(), reason="Database migration revisions are maintained locally")
LEGACY_COLUMNS = (
    "ALTER TABLE menu_menus DROP COLUMN permission, "
    "ADD COLUMN buttons json DEFAULT '[]', ADD COLUMN interfaces json DEFAULT '[]'"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("menu_permission_migration", PATH)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def _insert(sync, route_name: str, menu_type: str = "MENU", constant: bool = False) -> None:
    sync.execute(
        text(
            'INSERT INTO menu_menus (id, create_time, update_time, menu_name, menu_type, "order", route_name, '
            "route_path, icon_type, status, hide_in_menu, keep_alive, constant, multi_tab, query) VALUES "
            "(gen_random_uuid(), now(), now(), :name, :menu_type, 0, :name, :path, 'ICONIFY', 'ON', false, false, "
            ":constant, false, '[]')"
        ),
        {"name": route_name, "menu_type": menu_type, "path": f"/{route_name}", "constant": constant},
    )


@pytest.mark.asyncio
async def test_menu_permission_migration_fills_seed_pages_and_drops_legacy_columns(pg_engine):
    migration = _load_migration()
    async with pg_engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await connection.execute(text("CREATE SCHEMA rbac_p3_menu_check"))
            await connection.execute(text("SET LOCAL search_path TO rbac_p3_menu_check"))

            def check(sync):
                Menu.__table__.create(sync)
                sync.execute(text(LEGACY_COLUMNS))
                _insert(sync, "manage_user")
                _insert(sync, "manage", menu_type="DIRECTORY")
                _insert(sync, "custom_page")
                with Operations.context(MigrationContext.configure(sync)):
                    migration.upgrade()
                    rows = dict(sync.execute(text("SELECT route_name, permission FROM menu_menus")).all())
                    assert rows == {"manage_user": "user:read", "manage": None, "custom_page": None}
                    columns = {column["name"] for column in inspect(sync).get_columns("menu_menus")}
                    assert "buttons" not in columns and "interfaces" not in columns
                    migration.downgrade()
                    columns = {column["name"] for column in inspect(sync).get_columns("menu_menus")}
                    assert {"buttons", "interfaces"} <= columns
                    assert "permission" not in columns

            await connection.run_sync(check)
        finally:
            await transaction.rollback()
