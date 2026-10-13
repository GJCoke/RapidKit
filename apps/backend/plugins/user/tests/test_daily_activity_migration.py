"""Legacy user schemas can acquire activity tracking without losing users."""

from datetime import date
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from plugin_user.models import User, UserDailyActivity
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import SQLModel


def user_head():
    versions = Path(__file__).resolve().parents[1] / "migrations" / "versions"
    script = ScriptDirectory(str(versions.parent), version_locations=[str(versions)])
    return script.get_revision("user@head").module


def test_upgrade_repairs_missing_activity_table_and_preserves_data():
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
            SQLModel.metadata.create_all(connection, tables=[User.__table__])
            user = User(name="Existing", email="existing@example.com", username="existing", password=b"hash")
            connection.execute(User.__table__.insert().values(**user.model_dump()))
            user_head().upgrade()
            assert connection.execute(sa.select(User.username)).scalars().all() == ["existing"]
            statement = insert(UserDailyActivity).values(user_id=user.id, activity_date=date(2026, 10, 9))
            statement = statement.on_conflict_do_nothing(index_elements=["activity_date", "user_id"])
            connection.execute(statement)
            connection.execute(statement)
            user_head().upgrade()
            user_head().downgrade()
            assert connection.execute(sa.select(sa.func.count()).select_from(UserDailyActivity)).scalar_one() == 1
            inspector = sa.inspect(connection)
            assert {index["name"] for index in inspector.get_indexes("user_daily_activities")} == {
                f"ix_user_daily_activities_{column}" for column in ("id", "created_by", "user_id", "activity_date")
            }
            assert inspector.get_foreign_keys("user_daily_activities")[0]["referred_table"] == "user_users"
    finally:
        engine.dispose()
