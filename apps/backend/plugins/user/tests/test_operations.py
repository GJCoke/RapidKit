"""User operations statistics tests."""

from datetime import UTC, datetime

from plugin_user.operations import activity_date_for
from rapidkit_core.timezone import TimeZone


def test_activity_date_uses_configured_timezone() -> None:
    shanghai = TimeZone("Asia/Shanghai")

    assert activity_date_for(datetime(2026, 9, 1, 16, 30, tzinfo=UTC), shanghai).isoformat() == "2026-09-02"
