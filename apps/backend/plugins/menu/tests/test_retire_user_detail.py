"""Retiring a page preserves unrelated menus and their references."""

import runpy
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = Path(__file__).resolve().parents[1] / "migrations/versions/20261020_retire_user_detail.py"


def test_upgrade_removes_detail_and_preserves_other_menus():
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    menus = sa.Table(
        "menu_menus",
        metadata,
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("route_name", sa.String),
        sa.Column("parent_id", sa.String),
        sa.Column("active_menu_id", sa.String, sa.ForeignKey("menu_menus.id")),
    )
    metadata.create_all(engine)
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.execute(
            menus.insert(),
            [
                {"id": "manage", "route_name": "manage", "parent_id": None, "active_menu_id": None},
                {"id": "detail", "route_name": "manage_user-detail", "parent_id": "manage", "active_menu_id": None},
                {"id": "custom", "route_name": "custom", "parent_id": "detail", "active_menu_id": "detail"},
            ],
        )
        migration = runpy.run_path(str(MIGRATION))
        migration["upgrade"]()
        migration["upgrade"]()
        rows = connection.execute(sa.select(menus).order_by(menus.c.id)).mappings().all()
        assert [row["route_name"] for row in rows] == ["custom", "manage"]
        assert rows[0]["parent_id"] == "manage"
        assert rows[0]["active_menu_id"] is None
    engine.dispose()


def test_upgrade_accepts_a_fresh_database():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        runpy.run_path(str(MIGRATION))["upgrade"]()
        assert sa.inspect(connection).get_table_names() == []
    engine.dispose()
