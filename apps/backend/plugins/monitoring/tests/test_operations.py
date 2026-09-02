"""Monitoring operations statistics tests."""

from datetime import date, datetime
from types import SimpleNamespace

from plugin_monitoring.operations import build_daily_points


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
