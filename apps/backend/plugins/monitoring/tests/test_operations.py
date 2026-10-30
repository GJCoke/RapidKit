"""Monitoring operations statistics tests."""

from datetime import date, datetime
from types import SimpleNamespace
import pytest

from plugin_monitoring.operations import build_daily_points


@pytest.mark.asyncio
async def test_error_comparison_uses_calendar_yesterday_on_dst(monkeypatch):
    import plugin_monitoring.operations as module
    from unittest.mock import AsyncMock
    from rapidkit_core.timezone import TimeZone

    clock = TimeZone("Europe/Berlin")
    monkeypatch.setattr(module, "timezone", clock)
    provider = module.MonitoringOperationsProviderImpl()
    provider._rows = AsyncMock(return_value=[])
    start = clock.start_of_day(date(2026, 3, 30))
    end = clock.start_of_day(date(2026, 3, 31))
    await provider.get_api_error_comparison(start, end)
    provider._rows.assert_awaited_once_with(datetime(2026, 3, 28, 23), end)


def test_daily_points_use_weighted_latency_and_fill_empty_days() -> None:
    rows = [
        SimpleNamespace(time_bucket=datetime(2026, 9, 1, 1), request_count=3, error_count=0, avg_ms=10),
        SimpleNamespace(time_bucket=datetime(2026, 9, 1, 2), request_count=1, error_count=1, avg_ms=70),
    ]

    points = build_daily_points(rows, date(2026, 9, 1), date(2026, 9, 3))

    assert points[0].request_count == 4
    assert points[0].avg_response_ms == 25.0
    assert points[1].request_count == 0
    assert points[1].avg_response_ms is None
