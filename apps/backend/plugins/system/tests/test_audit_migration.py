"""The system baseline initializes the current audit schema on an empty database."""

import runpy
from pathlib import Path

import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from plugin_system.models import AuditLog, AuditLogTarget


def test_initial_migration_creates_structured_audit_schema():
    root = Path(__file__).parents[3]
    config = Config()
    config.set_main_option("path_separator", "os")
    config.set_main_option("script_location", str(root / "alembic"))
    config.set_main_option("version_locations", str(root / "plugins/system/migrations/versions"))
    history = ScriptDirectory.from_config(config)
    head = history.get_revision("system@head")
    assert head.down_revision is None
    assert len(list(history.walk_revisions())) == 1
    migration = runpy.run_path(head.path)
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                migration["upgrade"]()
            inspector = sa.inspect(connection)
            assert "system_activity_events" in inspector.get_table_names()
            for model in (AuditLog, AuditLogTarget):
                columns = {column["name"] for column in inspector.get_columns(model.__tablename__)}
                assert columns == set(model.__table__.columns.keys())
                assert "schema_version" not in columns
                indexes = {index["name"] for index in inspector.get_indexes(model.__tablename__)}
                assert {index.name for index in model.__table__.indexes} <= indexes
    finally:
        engine.dispose()
