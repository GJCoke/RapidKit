"""Tests for PermissionContext."""

from unittest.mock import MagicMock


from plugin_permission.context import PermissionContext
from plugins.permission.tests.catalog_fixtures import install_catalog


class TestPermissionContext:
    def test_is_stale_when_versions_mismatch(self):
        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={"ADMIN": 3, "EDITOR": 5},
            current_role_versions={"ADMIN": 3, "EDITOR": 7},
        )
        assert ctx.is_stale is True

    def test_not_stale_when_versions_match(self):
        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={"ADMIN": 3, "EDITOR": 5},
            current_role_versions={"ADMIN": 3, "EDITOR": 5},
        )
        assert ctx.is_stale is False

    def test_stale_when_new_role_added(self):
        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={"ADMIN": 3},
            current_role_versions={"ADMIN": 3, "EDITOR": 1},
        )
        assert ctx.is_stale is True


    def test_allows_route_when_user_holds_bound_code(self):
        install_catalog()
        ctx = PermissionContext(
            user=MagicMock(), cached_role_versions={}, current_role_versions={}, codes=["user:read"]
        )

        assert ctx.allows_route("GET:/api/v1/users") is True
        assert ctx.allows_route("DELETE:/api/v1/users/{user_id}") is False
