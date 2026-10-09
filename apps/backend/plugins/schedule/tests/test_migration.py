"""Exercise the real legacy-to-decimal migration while preserving coordinates."""

from importlib import import_module

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_solar_migration_preserves_values_and_accepts_decimals():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        import_module("plugins.schedule.migrations.versions.baefb869cf5b_init").upgrade()
        connection.execute(
            sa.text(
                "INSERT INTO schedule_solar_schedules(id,create_time,update_time,event,latitude,longitude) "
                "VALUES ('test','2026-10-08','2026-10-08','SUNRISE',31,121)"
            )
        )
        migration = import_module("plugins.schedule.migrations.versions.d83e41a926c0_solar_decimal_coordinates")
        migration.upgrade()
        assert connection.execute(sa.text("SELECT latitude,longitude FROM schedule_solar_schedules")).one() == (31, 121)
        columns = {c["name"]: c for c in sa.inspect(connection).get_columns("schedule_solar_schedules")}
        assert isinstance(columns["latitude"]["type"], sa.Float)
        connection.execute(sa.text("UPDATE schedule_solar_schedules SET latitude=-37.81753,longitude=144.96715"))
        assert connection.execute(sa.text("SELECT latitude,longitude FROM schedule_solar_schedules")).one() == (
            -37.81753,
            144.96715,
        )
        with pytest.raises(ValueError, match="fractional"):
            migration.downgrade()
