import os
import time
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from rapidkit_core.timezone import TimeZone


@pytest.mark.parametrize("system_zone", ["UTC", "Asia/Shanghai", "America/New_York"])
def test_naive_utc_conversion_does_not_depend_on_system_zone(system_zone):
    previous = os.environ.get("TZ")
    try:
        os.environ["TZ"] = system_zone
        time.tzset()
        assert TimeZone.to_utc(datetime(2026, 10, 29, 8)) == datetime(2026, 10, 29, 8, tzinfo=UTC)
        assert TimeZone.to_utc(datetime(2026, 10, 29, 16, tzinfo=ZoneInfo("Asia/Shanghai"))) == datetime(
            2026, 10, 29, 8, tzinfo=UTC
        )
    finally:
        if previous is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = previous
        time.tzset()


@pytest.mark.parametrize(
    "zone,day,expected_start,hours",
    [
        ("Asia/Shanghai", date(2026, 10, 29), datetime(2026, 10, 28, 16), 24),
        ("Europe/Berlin", date(2026, 3, 29), datetime(2026, 3, 28, 23), 23),
        ("America/New_York", date(2026, 11, 1), datetime(2026, 11, 1, 4), 25),
    ],
)
def test_calendar_midnights_preserve_local_day_length(zone, day, expected_start, hours):
    clock = TimeZone(zone)
    assert clock.start_of_day(day) == expected_start
    assert clock.start_of_day(day + timedelta(days=1)) - expected_start == timedelta(hours=hours)
