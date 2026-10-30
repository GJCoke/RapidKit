import importlib.util
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import MetaData, Table, inspect
from sqlalchemy.schema import CreateSchema, DropSchema


def migration(prefix):
    path = next((Path(__file__).resolve().parents[1] / "plugins/worker/migrations/versions").glob(prefix + "*.py"))
    spec = importlib.util.spec_from_file_location(prefix, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_worker_baseline_and_additive_migration_preserve_legacy_rows(pg_engine):
    baseline, increment = migration("20d0b7afff25"), migration("09643ec2170c")
    assert increment.down_revision == baseline.revision
    schema = "obs_b_" + uuid4().hex

    def exercise(connection):
        # All migration DDL is scoped to this disposable test schema, including enum types.
        connection.execute(CreateSchema(schema))
        connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
        with Operations.context(MigrationContext.configure(connection)):
            baseline.upgrade()
            old = Table("worker_task_results", MetaData(), autoload_with=connection)
            now = datetime(2026, 10, 30)
            connection.execute(
                old.insert().values(
                    id=uuid4(),
                    create_time=now,
                    update_time=now,
                    task_id="legacy",
                    task_name="demo",
                    status="PENDING",
                    worker_hostname="",
                    retries=0,
                )
            )
            increment.upgrade()
            updated = Table("worker_task_results", MetaData(), autoload_with=connection)
            row = connection.execute(updated.select()).mappings().one()
            assert row["request_id"] is None and row["correlation_id"] is None
            indexes = {index["name"] for index in inspect(connection).get_indexes("worker_task_results")}
            assert {"ix_worker_task_results_request_id", "ix_worker_task_results_correlation_id"} <= indexes
            increment.downgrade()
            assert "request_id" not in {
                column["name"] for column in inspect(connection).get_columns("worker_task_results")
            }
            increment.upgrade()
            row = connection.execute(updated.select()).mappings().one()
            assert row["task_id"] == "legacy" and row["request_id"] is None
            connection.execute(DropSchema(schema, cascade=True))

    async with pg_engine.begin() as connection:
        await connection.run_sync(exercise)
