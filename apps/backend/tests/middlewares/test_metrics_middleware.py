"""Tests for MetricsMiddleware path normalization."""

from src.middlewares.metrics import _normalize_path


class TestNormalizePath:
    def test_uuid_replaced(self):
        path = "/api/v1/users/550e8400-e29b-41d4-a716-446655440000"
        assert _normalize_path(path) == "/api/v1/users/{id}"

    def test_multiple_uuids(self):
        path = "/api/v1/roles/550e8400-e29b-41d4-a716-446655440000/permissions"
        assert _normalize_path(path) == "/api/v1/roles/{id}/permissions"

    def test_numeric_segment_replaced(self):
        path = "/api/v1/items/12345"
        assert _normalize_path(path) == "/api/v1/items/{id}"

    def test_path_without_ids_unchanged(self):
        path = "/api/v1/users"
        assert _normalize_path(path) == "/api/v1/users"

    def test_mixed_uuid_and_numeric(self):
        path = "/api/v1/users/550e8400-e29b-41d4-a716-446655440000/items/42"
        assert _normalize_path(path) == "/api/v1/users/{id}/items/{id}"

    def test_uuid_case_insensitive(self):
        path = "/api/v1/users/550E8400-E29B-41D4-A716-446655440000"
        assert _normalize_path(path) == "/api/v1/users/{id}"

    def test_trailing_slash_numeric(self):
        path = "/api/v1/items/999/"
        result = _normalize_path(path)
        # Numeric followed by / should still be replaced
        assert "{id}" in result

    def test_root_path_unchanged(self):
        assert _normalize_path("/") == "/"

    def test_empty_path(self):
        assert _normalize_path("") == ""

    def test_numeric_not_in_path_segment_prefix(self):
        """v1 in /api/v1/ should NOT be replaced (not a pure numeric segment)."""
        path = "/api/v1/users"
        assert _normalize_path(path) == "/api/v1/users"
