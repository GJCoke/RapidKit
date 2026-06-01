"""Tests for check_route_permission function."""

import pytest

from plugin_permission.rbac import PermissionDenied, check_route_permission


class TestCheckRoutePermission:
    def test_admin_always_passes(self):
        result = check_route_permission(
            permissions=[], route_key="DELETE:/api/nuke", is_admin=True
        )
        assert result is True

    def test_allowed_route_passes(self):
        result = check_route_permission(
            permissions=["GET:/api/v1/users", "POST:/api/v1/users"],
            route_key="GET:/api/v1/users",
            is_admin=False,
        )
        assert result is True

    def test_denied_route_raises(self):
        with pytest.raises(PermissionDenied):
            check_route_permission(
                permissions=["GET:/api/v1/users"],
                route_key="DELETE:/api/v1/users",
                is_admin=False,
            )

    def test_empty_permissions_denies(self):
        with pytest.raises(PermissionDenied):
            check_route_permission(
                permissions=[], route_key="GET:/api/v1/users", is_admin=False
            )
