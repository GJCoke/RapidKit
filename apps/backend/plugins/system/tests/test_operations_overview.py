"""Operations overview orchestration tests."""

import pytest
from pydantic import ValidationError

from plugin_system.api import router
from plugin_system.operations import calculate_percent_change, server_status
from plugin_system.schemas import OperationsOverviewQuery


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
