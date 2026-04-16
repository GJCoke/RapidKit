"""Route API tests (constant and user routes)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestConstantRoutes:
    async def test_get_constant_routes(self, client: AsyncClient, init):
        """Constant routes should be available without auth."""
        resp = await client.get("/route/constant")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        routes = body["data"]
        assert isinstance(routes, list)
        # Should contain login, 404, etc.
        route_names = [r["name"] for r in routes]
        assert "login" in route_names
        assert "404" in route_names

    async def test_constant_routes_have_meta(self, client: AsyncClient, init):
        """Each constant route should include a meta object."""
        resp = await client.get("/route/constant")
        routes = resp.json()["data"]
        for route in routes:
            assert "meta" in route
            assert "title" in route["meta"]


@pytest.mark.asyncio
class TestUserRoutes:
    async def test_get_user_routes(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/route/user", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        # UserRouteResponse has routes (list) and home (str)
        assert isinstance(data["routes"], list)
        assert isinstance(data["home"], str)

    async def test_check_route_name_exists(self, client: AsyncClient, init, auth_headers: dict):
        # The query parameter alias is routeName
        resp = await client.get("/route/exist?routeName=home", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_check_nonexistent_route_name(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/route/exist?routeName=definitely_not_a_route",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"] is False
