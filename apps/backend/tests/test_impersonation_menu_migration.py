import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from plugin_menu.models import Menu
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from src._menu_seeds import build_menus

PATH = Path(__file__).resolve().parents[1] / "plugins/menu/migrations/versions/20261015_user_detail.py"


@pytest.mark.asyncio
async def test_hidden_detail_migration_is_idempotent_and_preserves_custom_menu():
    spec = importlib.util.spec_from_file_location("impersonation_menu_migration", PATH)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_async_engine("postgresql+asyncpg://test:test@127.0.0.1:15432/test")
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(text("CREATE SCHEMA task17_menu_check"))
                await connection.execute(text("SET LOCAL search_path TO task17_menu_check"))

                def check(sync):
                    Menu.__table__.create(sync)
                    parent = next(menu for menu in build_menus() if menu.route_name == "manage")
                    sync.execute(Menu.__table__.insert().values(**parent.model_dump()))
                    with Operations.context(MigrationContext.configure(sync)):
                        migration.upgrade()
                        migration.upgrade()
                        row = (
                            sync.execute(text("SELECT * FROM menu_menus WHERE route_name='manage_user-detail'"))
                            .mappings()
                            .one()
                        )
                        assert row["hide_in_menu"] and not row["constant"]
                        assert row["route_path"] == "/manage/user-detail/:id"
                        migration.downgrade()
                        assert (
                            sync.execute(
                                text("SELECT count(*) FROM menu_menus WHERE route_name='manage_user-detail'")
                            ).scalar_one()
                            == 0
                        )
                        migration.upgrade()
                        sync.execute(
                            text(
                                "UPDATE menu_menus SET id='01a13f7c-3d5b-77f4-853e-b7aa0d399b91', "
                                "menu_name='Custom detail' WHERE route_name='manage_user-detail'"
                            )
                        )
                        migration.upgrade()
                        migration.downgrade()
                        assert (
                            sync.execute(
                                text("SELECT menu_name FROM menu_menus WHERE route_name='manage_user-detail'")
                            ).scalar_one()
                            == "Custom detail"
                        )

                await connection.run_sync(check)
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
