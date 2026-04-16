"""Tests for exception handlers registered in main.py.

These are integration tests that require the full app client (Postgres + Redis).
They will be skipped when services are unavailable.
"""

from httpx import AsyncClient


class TestAppExceptionHandler:
    """AppException should return HTTP 200 with business error code."""

    async def test_invalid_login_returns_biz_error(self, client: AsyncClient):
        """Login with wrong password triggers AppException."""
        resp = await client.post(
            "/auth/login",
            json={"username": "nonexistent", "password": "wrong"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] != 0  # business error code, not success

    async def test_not_found_resource(self, client: AsyncClient, init):
        """Accessing a non-existent resource returns AppException."""
        from tests.testing.utils import random_uuid

        resp = await client.get(f"/users/{random_uuid()}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] != 0


class TestValidationErrorHandler:
    """RequestValidationError should return HTTP 200 + VALIDATION_ERROR code."""

    async def test_missing_required_field(self, client: AsyncClient, init):
        """POST without required body fields."""
        resp = await client.post("/auth/login", json={})
        assert resp.status_code == 200
        body = resp.json()
        # StatusCode.VALIDATION_ERROR
        assert body["code"] != 0
        assert body["data"] is not None  # formatted error details


class TestGenericExceptionHandler:
    """Unhandled exceptions should return HTTP 200 + INTERNAL_SERVER_ERROR code."""

    async def test_unknown_route_returns_http_error(self, client: AsyncClient):
        """Requesting non-existent endpoint."""
        resp = await client.get("/nonexistent/endpoint")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] != 0
