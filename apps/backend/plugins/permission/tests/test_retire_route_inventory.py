"""The targeted migration preserves unrelated role grants on existing databases."""

import runpy
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = Path(__file__).resolve().parents[1] / "migrations/versions/20261020_retire_route_inventory.py"


@pytest.mark.parametrize("old_table", [True, False])
def test_upgrade_removes_only_retired_inventory_and_grants(old_table):
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    roles = sa.Table(
        "permission_roles",
        metadata,
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("permission_codes", sa.JSON),
    )
    if old_table:
        sa.Table("permission_routers", metadata, sa.Column("id", sa.String, primary_key=True))
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            roles.insert(),
            [
                {"id": "one", "permission_codes": ["role:grant", "api-route:read", "user:read"]},
                {"id": "two", "permission_codes": ["menu:read"]},
            ],
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration = runpy.run_path(str(MIGRATION))
            migration["upgrade"]()
            assert "permission_routers" not in sa.inspect(connection).get_table_names()
            assert connection.execute(sa.select(roles.c.permission_codes).order_by(roles.c.id)).scalars().all() == [
                ["role:grant", "user:read"],
                ["menu:read"],
            ]
            migration["downgrade"]()
            assert "permission_routers" in sa.inspect(connection).get_table_names()
    engine.dispose()


def test_upgrade_accepts_a_fresh_database():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        runpy.run_path(str(MIGRATION))["upgrade"]()
        assert sa.inspect(connection).get_table_names() == []
    engine.dispose()
