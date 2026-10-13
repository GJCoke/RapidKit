"""Exercise notification initialization through its migration, not metadata.create_all."""

from importlib import import_module
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from plugin_notification.crud import UserNotificationCRUD
from plugin_notification.models import (
    NotificationAudience,
    NotificationBannerState,
    NotificationMessage,
    NotificationOutbox,
    NotificationPreference,
    NotificationTemplate,
    UserNotification,
)
from sqlalchemy import UniqueConstraint, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

MIGRATION = "plugins.notification.migrations.versions.91bb8dbd2d31_init"
PERSONALIZATION_MIGRATION = "plugins.notification.migrations.versions.b4345bba80e3_add_recipient_content_snapshots"
BANNER_MIGRATION = "plugins.notification.migrations.versions.d73a2bf8c619_add_global_banner_state"
MODELS = (
    NotificationBannerState,
    NotificationMessage,
    NotificationAudience,
    UserNotification,
    NotificationOutbox,
    NotificationTemplate,
    NotificationPreference,
)


def apply_migration(connection):
    with Operations.context(MigrationContext.configure(connection)):
        import_module(MIGRATION).upgrade()
        import_module(PERSONALIZATION_MIGRATION).upgrade()
        import_module(BANNER_MIGRATION).upgrade()


def assert_schema(connection):
    inspector = inspect(connection)
    assert set(inspector.get_table_names()) == {model.__tablename__ for model in MODELS}
    for model in MODELS:
        table = model.__table__
        columns = {column["name"]: column for column in inspector.get_columns(table.name)}
        assert set(columns) == set(table.columns.keys())
        for column in table.columns:
            assert columns[column.name]["nullable"] == column.nullable
        assert {
            index["name"] for index in inspector.get_indexes(table.name) if not index.get("duplicates_constraint")
        } == {index.name for index in table.indexes}
        assert {tuple(constraint["column_names"]) for constraint in inspector.get_unique_constraints(table.name)} == {
            tuple(constraint.columns.keys())
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }


@pytest.mark.asyncio
async def test_migration_creates_full_schema_and_restores_unread_count():
    engine = create_async_engine("sqlite+aiosqlite://")
    user_id = uuid4()
    try:
        async with AsyncSession(engine) as session:
            with pytest.raises(OperationalError, match="no such table: notification_user_notifications"):
                await UserNotificationCRUD(session).get_unread_count(user_id)
        async with engine.begin() as connection:
            await connection.run_sync(apply_migration)
            await connection.run_sync(assert_schema)
        async with AsyncSession(engine) as session:
            assert await UserNotificationCRUD(session).get_unread_count(user_id) == 0
            message = NotificationMessage(
                source="admin",
                category="system",
                content_mode="raw",
                title="Test title",
                content="Test body",
                status="published",
                correlation_id=uuid4().hex,
            )
            session.add(message)
            await session.flush()
            session.add(UserNotification(message_id=message.id, user_id=user_id))
            await session.flush()
            assert await UserNotificationCRUD(session).get_unread_count(user_id) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_personalization_migration_preserves_legacy_rows_and_reverses_only_new_columns():
    engine = create_async_engine("sqlite+aiosqlite://")
    user_id, message_id, inbox_id = uuid4(), uuid4(), uuid4()

    def upgrade_initial(connection):
        with Operations.context(MigrationContext.configure(connection)):
            import_module(MIGRATION).upgrade()

    def upgrade_banner(connection):
        with Operations.context(MigrationContext.configure(connection)):
            import_module(BANNER_MIGRATION).upgrade()

    def upgrade_personalization(connection):
        with Operations.context(MigrationContext.configure(connection)):
            import_module(PERSONALIZATION_MIGRATION).upgrade()
            import_module(PERSONALIZATION_MIGRATION).upgrade()

    def downgrade_personalization(connection):
        with Operations.context(MigrationContext.configure(connection)):
            import_module(PERSONALIZATION_MIGRATION).downgrade()
            import_module(PERSONALIZATION_MIGRATION).downgrade()
        assert "personalization" not in {c["name"] for c in inspect(connection).get_columns("notification_messages")}
        assert "rendered_content" not in {
            c["name"] for c in inspect(connection).get_columns("notification_user_notifications")
        }

    try:
        async with engine.begin() as connection:
            await connection.run_sync(upgrade_initial)
            await connection.execute(
                text(
                    "INSERT INTO notification_user_notifications (id, message_id, user_id, create_time, update_time) "
                    "VALUES (:id, :message_id, :user_id, '2030-01-01', '2030-01-01')"
                ),
                {"id": inbox_id.hex, "message_id": message_id.hex, "user_id": user_id.hex},
            )
            await connection.run_sync(upgrade_personalization)
            await connection.run_sync(upgrade_banner)
            await connection.run_sync(assert_schema)
            result = (
                await connection.execute(text("SELECT id, rendered_content FROM notification_user_notifications"))
            ).one()
            assert result == (inbox_id.hex, None)
            await connection.run_sync(downgrade_personalization)
            assert (
                await connection.execute(text("SELECT id FROM notification_user_notifications"))
            ).scalar_one() == inbox_id.hex
            await connection.run_sync(upgrade_personalization)
            await connection.run_sync(assert_schema)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_banner_migration_seeds_lock_preserves_legacy_default_and_reverses():
    engine = create_async_engine("sqlite+aiosqlite://")
    message_id = uuid4()

    def exercise(connection):
        with Operations.context(MigrationContext.configure(connection)):
            import_module(MIGRATION).upgrade()
            import_module(PERSONALIZATION_MIGRATION).upgrade()
            connection.execute(
                text(
                    "INSERT INTO notification_messages "
                    "(id, create_time, update_time, source, category, level, content_mode, title, content, "
                    "mandatory, status, correlation_id) "
                    "VALUES (:id, '2030-01-01', '2030-01-01', 'admin', 'admin.announcement', 'info', 'raw', "
                    "'Legacy', 'Legacy body', false, 'published', 'legacy')"
                ),
                {"id": message_id.hex},
            )
            migration = import_module(BANNER_MIGRATION)
            assert migration.down_revision == "b4345bba80e3"
            migration.upgrade()
            assert connection.execute(
                text("SELECT display_mode, superseded_at, superseded_by_id FROM notification_messages")
            ).one() == ("inbox", None, None)
            assert connection.execute(
                text("SELECT id, revision, active_message_id, scheduled_message_id FROM notification_banner_state")
            ).one() == ("00000000000070008000000000000001", 0, None, None)
            assert_schema(connection)
            migration.downgrade()
            columns = {column["name"] for column in inspect(connection).get_columns("notification_messages")}
            assert not {"display_mode", "superseded_at", "superseded_by_id"} & columns
            assert "notification_banner_state" not in inspect(connection).get_table_names()
            assert connection.execute(text("SELECT id, title FROM notification_messages")).one() == (
                message_id.hex,
                "Legacy",
            )
            migration.upgrade()
            assert_schema(connection)

    try:
        async with engine.begin() as connection:
            await connection.run_sync(exercise)
    finally:
        await engine.dispose()
