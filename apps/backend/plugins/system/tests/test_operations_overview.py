"""Operations overview orchestration tests."""

import pytest
from plugin_system.dashboard.api import router
from plugin_system.dashboard.operations import calculate_percent_change, server_status
from plugin_system.dashboard.schemas import OperationsOverviewQuery
from pydantic import ValidationError


def test_percent_change_zero_rules() -> None:
    assert calculate_percent_change(0, 0) == 0.0
    assert calculate_percent_change(5, 0) is None
    assert calculate_percent_change(12, 10) == 20.0


def test_server_status_uses_healthy_ratio() -> None:
    assert server_status(2, 2) == "healthy"
    assert server_status(1, 2) == "degraded"
    assert server_status(0, 2) == "down"
    assert server_status(0, 0) == "down"


def test_custom_range_requires_both_dates() -> None:
    with pytest.raises(ValidationError):
        OperationsOverviewQuery(range="custom")


def test_operations_overview_route_is_registered() -> None:
    route = next(route for route in router.routes if route.path == "/system/stats/operations-overview")

    assert "GET" in route.methods


def test_per_group_deficit_cannot_be_hidden_by_excess_workers():
    assert server_status(3, 3, missing=1) == "degraded"
    assert server_status(0, 0, missing=0) == "healthy"


@pytest.mark.asyncio
async def test_week_comparison_uses_calendar_boundaries_across_dst(monkeypatch):
    from datetime import date, datetime
    from unittest.mock import AsyncMock
    import plugin_system.dashboard.operations as module
    from rapidkit_core.timezone import TimeZone

    clock = TimeZone("Europe/Berlin")
    clock.now_local = lambda: datetime(2026, 3, 30, 12, tzinfo=clock.tz_info)
    clock.now = lambda: datetime(2026, 3, 30, 10)
    monkeypatch.setattr(module, "timezone", clock)
    provider = AsyncMock()
    monkeypatch.setattr(module, "get_service_optional", lambda _: provider)
    await module.build_operations_overview(OperationsOverviewQuery(), clock.now())
    provider.get_task_success_comparison.assert_awaited_once_with(
        clock.start_of_day(date(2026, 3, 24)),
        clock.now(),
        clock.start_of_day(date(2026, 3, 17)),
    )
