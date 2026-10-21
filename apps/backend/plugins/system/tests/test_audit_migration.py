import runpy
from pathlib import Path
from uuid import uuid4

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from plugin_system.models import AuditLog
from rapidkit_core.timezone import timezone


def test_migration_preserves_historical_payload_and_adds_v1_defaults():
    metadata = sa.MetaData()
    old = AuditLog.__table__.to_metadata(metadata)
    for name in ("schema_version", "actor_type", "actor_username", "business_code", "error_key", "duration_ms"):
        old._columns.remove(old.c[name])
    old.indexes = {index for index in old.indexes if not index.name.startswith("ix_audit_")}
    engine = sa.create_engine("sqlite://")
    migration = runpy.run_path(str(Path(__file__).parents[1] / "migrations/versions/20261021_structured_audit.py"))
    with engine.begin() as connection:
        metadata.create_all(connection)
        connection.execute(
            old.insert().values(
                id=uuid4(),
                action="publish.create",
                result="success",
                source="http",
                resource_name="old",
                metadata={},
                occurred_at=timezone.now(),
            )
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
        target_migration = runpy.run_path(
            str(Path(__file__).parents[1] / "migrations/versions/20261021_audit_targets.py")
        )
        with Operations.context(MigrationContext.configure(connection)):
            target_migration["upgrade"]()
        assert "system_audit_log_targets" in sa.inspect(connection).get_table_names()
        row = connection.execute(
            sa.text("SELECT action, resource_name, schema_version, actor_type FROM system_audit_logs")
        ).one()
        assert tuple(row) == ("publish.create", "old", 1, "unknown")
    engine.dispose()
