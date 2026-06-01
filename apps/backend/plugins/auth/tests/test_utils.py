"""Tests for auth plugin utilities."""

from plugin_permission.utils import build_route_key


class TestBuildRouteKey:
    def test_single_method(self):
        assert build_route_key({"GET"}, "/api/v1/users") == "GET:/api/v1/users"

    def test_multiple_methods_sorted(self):
        result = build_route_key({"POST", "GET", "HEAD"}, "/api/v1/users")
        assert result == "GET:HEAD:POST:/api/v1/users"

    def test_deterministic_regardless_of_input_order(self):
        r1 = build_route_key({"GET", "HEAD"}, "/path")
        r2 = build_route_key({"HEAD", "GET"}, "/path")
        assert r1 == r2

    def test_empty_methods(self):
        assert build_route_key(set(), "/path") == ":/path"
