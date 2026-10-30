from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from pydantic import TypeAdapter
from rapidkit_common.schemas import types
from rapidkit_core.timezone import timezone


@pytest.mark.parametrize(
    "value", [datetime(2026, 10, 29, 8), datetime(2026, 10, 29, 16, tzinfo=ZoneInfo("Asia/Shanghai"))]
)
def test_utc_instant_preserves_naive_utc_and_nonzero_offsets(value):
    serialized = TypeAdapter(types.UTCInstant).dump_python(value, mode="json")
    assert datetime.fromisoformat(serialized) == datetime(2026, 10, 29, 8, tzinfo=UTC)
    assert datetime.fromisoformat(serialized).utcoffset().total_seconds() == 0


def test_editable_instant_carries_platform_offset_and_display_string_stays_compatible(monkeypatch):
    monkeypatch.setattr(timezone, "tz_info", ZoneInfo("Asia/Shanghai"))
    instant = datetime(2026, 10, 29, 8)
    assert TypeAdapter(types.EditableInstant).dump_python(instant, mode="json") == "2026-10-29T16:00:00+08:00"
    assert TypeAdapter(types.LocalDatetime).dump_python(instant, mode="json") == "2026-10-29 16:00:00"


def test_instant_schema_declares_datetime_transport():
    for instant_type in (types.UTCInstant, types.EditableInstant):
        assert TypeAdapter(instant_type).json_schema(mode="serialization")["format"] == "date-time"
