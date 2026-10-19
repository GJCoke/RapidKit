import importlib.util
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from plugin_auth.impersonation.models import ImpersonationSession
from rapidkit_core.timezone import timezone
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[2]


def load(plugin, filename):
    path = ROOT / plugin / "migrations" / "versions" / filename
    if not path.is_file():
        pytest.skip("Database migration revisions are maintained locally", allow_module_level=True)
    spec = importlib.util.spec_from_file_location(filename, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


AUTH = load("auth", "20261015_impersonation_sessions.py")
SYSTEM = load("system", "20261015_audit_impersonation.py")
BASE_SYSTEM = load("system", "95adc77af4f0_init.py")


def sql(module, direction):
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        getattr(module, direction)()
    return output.getvalue()


def test_revision_graph_and_postgresql_sql():
    assert (AUTH.revision, AUTH.down_revision, AUTH.branch_labels) == ("auth_imp_20261015", None, ("auth",))
    assert (SYSTEM.revision, SYSTEM.down_revision, SYSTEM.branch_labels) == ("sys_imp_20261015", "95adc77af4f0", None)
    up = sql(AUTH, "upgrade")
    assert "CREATE TABLE auth_impersonation_sessions" in up
    assert (
        "CREATE UNIQUE INDEX uq_auth_impersonation_active_actor ON "
        "auth_impersonation_sessions (actor_id) WHERE ended_at IS NULL" in up
    )
    for name in (
        "id",
        "created_by",
        "create_time",
        "update_time",
        "actor_id",
        "subject_user_id",
        "expires_at",
        "ended_at",
    ):
        assert name in up
    assert "DROP TABLE auth_impersonation_sessions" in sql(AUTH, "downgrade")
    up = sql(SYSTEM, "upgrade")
    down = sql(SYSTEM, "downgrade")
    assert "CREATE TABLE" not in up
    for name in ("subject_user_id", "impersonation_session_id"):
        assert f"ADD COLUMN {name} UUID;" in up
        assert f"CREATE INDEX ix_system_audit_logs_{name}" in up
        assert f"DROP COLUMN {name}" in down
        assert f"DROP INDEX ix_system_audit_logs_{name}" in down


@pytest.mark.asyncio
async def test_upgrade_downgrade_on_dedicated_postgresql():
    # Hardcoded test endpoint: never use application/service database configuration.
    engine = create_async_engine("postgresql+asyncpg://test:test@127.0.0.1:15432/test")
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await connection.execute(text("CREATE SCHEMA task3_migration_check"))
            await connection.execute(text("SET LOCAL search_path TO task3_migration_check"))

            def check(sync):
                with Operations.context(MigrationContext.configure(sync)):
                    BASE_SYSTEM.upgrade()
                    AUTH.upgrade()
                    SYSTEM.upgrade()
                    inspector = inspect(sync)
                    assert "auth_impersonation_sessions" in inspector.get_table_names()
                    cols = {c["name"]: c for c in inspector.get_columns("system_audit_logs")}
                    assert cols["subject_user_id"]["nullable"] and cols["impersonation_session_id"]["nullable"]
                    unique = next(
                        i
                        for i in inspector.get_indexes("auth_impersonation_sessions")
                        if i["name"] == "uq_auth_impersonation_active_actor"
                    )
                    assert unique["unique"]
                    table = ImpersonationSession.__table__
                    assert set(table.columns.keys()) == {c["name"] for c in inspector.get_columns(table.name)}
                    actor = uuid4()
                    values = dict(actor_id=actor, subject_user_id=uuid4(), expires_at=timezone.now())
                    sync.execute(table.insert().values(**values))
                    with sync.begin_nested() as savepoint:
                        with pytest.raises(IntegrityError):
                            sync.execute(table.insert().values(**values))
                        savepoint.rollback()
                    sync.execute(table.update().where(table.c.actor_id == actor).values(ended_at=timezone.now()))
                    sync.execute(table.insert().values(**values))
                    SYSTEM.downgrade()
                    AUTH.downgrade()
                    assert "auth_impersonation_sessions" not in inspect(sync).get_table_names()
                    assert "subject_user_id" not in {c["name"] for c in inspect(sync).get_columns("system_audit_logs")}
                    AUTH.upgrade()
                    SYSTEM.upgrade()

            await connection.run_sync(check)
        finally:
            await transaction.rollback()
    await engine.dispose()
