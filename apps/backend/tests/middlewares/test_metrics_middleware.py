"""Tests for MetricsMiddleware path normalization."""

from datetime import datetime
from types import SimpleNamespace

import pytest
from src.middlewares import metrics
from src.middlewares.metrics import _normalize_path


@pytest.mark.asyncio
async def test_redis_outcomes_distinguish_business_transport_and_http_errors(redis, monkeypatch):
    monkeypatch.setattr(metrics.RedisManager, "client", lambda **kwargs: redis)
    monkeypatch.setattr(metrics, "timezone", SimpleNamespace(now=lambda: datetime(2026, 10, 30, 12, 0, 0)))
    for status, code, outcome in ((200, 0, "success"), (200, 14003, "error"), (200, 0, "error"), (500, None, "error")):
        await metrics._record_metrics(
            status_code=status, duration_ms=1, path="/safe", route_path="/safe", business_code=code, outcome=outcome
        )
    assert await redis.hget("metrics:api:20261030_1200:GET:/safe", "count") == "4"
    assert await redis.hget("metrics:api:20261030_1200:GET:/safe", "errors") == "3"
    assert await redis.hget("metrics:errors:biz:20261030_12", "count") == "1"
    assert await redis.hget("metrics:errors:5xx:20261030_12", "count") == "1"


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
