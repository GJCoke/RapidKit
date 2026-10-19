"""PostgreSQL JSON defaults compare semantically during migration generation."""

import pytest
import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from scripts.alembic.server_defaults import compare_json_server_defaults


@pytest.mark.asyncio
@pytest.mark.parametrize(("default", "changed"), [("[]", False), ("[1]", True)])
async def test_json_defaults_can_be_compared_without_json_equality(pg_engine, default, changed):
    schema = "rbac_json_default_check"
    async with pg_engine.connect() as connection:
        transaction = await connection.begin()
        try:

            def check(sync):
                sync.execute(sa.text(f"CREATE SCHEMA {schema}"))
                stored = sa.MetaData()
                table = sa.Table(
                    "json_defaults",
                    stored,
                    sa.Column("value", sa.JSON, server_default=sa.text("'[]'::json")),
                    schema=schema,
                )
                table.create(sync)
                desired = sa.MetaData()
                sa.Table("json_defaults", desired, sa.Column("value", sa.JSON, server_default=default), schema=schema)

                def include_name(name, kind, parent):
                    if kind == "schema":
                        return name == schema
                    if kind == "table":
                        return name == "json_defaults"
                    return True

                context = MigrationContext.configure(
                    sync,
                    opts={
                        "include_schemas": True,
                        "include_name": include_name,
                        "compare_server_default": compare_json_server_defaults,
                    },
                )
                differences = compare_metadata(context, desired)
                assert bool(differences) is changed
                if changed:
                    assert differences[0][0][0] == "modify_default"

            await connection.run_sync(check)
        finally:
            await transaction.rollback()
