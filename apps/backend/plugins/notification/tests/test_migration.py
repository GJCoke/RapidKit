"""Exercise notification initialization through its migration, not metadata.create_all."""

from importlib import import_module
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from plugin_notification.crud import UserNotificationCRUD
from plugin_notification.models import (
    NotificationAudience,
    NotificationMessage,
    NotificationOutbox,
    NotificationPreference,
    NotificationTemplate,
    UserNotification,
)
from sqlalchemy import UniqueConstraint, inspect
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

MIGRATION = "plugins.notification.migrations.versions.91bb8dbd2d31_init"
MODELS = (
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
            session.add(UserNotification(message_id=uuid4(), user_id=user_id))
            await session.flush()
            assert await UserNotificationCRUD(session).get_unread_count(user_id) == 1
    finally:
        await engine.dispose()
