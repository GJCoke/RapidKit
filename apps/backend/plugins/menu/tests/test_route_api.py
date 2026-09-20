"""Route API tests (constant and user routes)."""

import pytest
from httpx import AsyncClient
from tests.testing.utils import random_lowercase


def _menu_payload(**overrides) -> dict:
    name = random_lowercase(8)
    payload = {
        "menuName": f"Route {name}",
        "menuType": 2,
        "routeName": f"route_{name}",
        "routePath": f"/route/{name}",
        "component": "view.route",
    }
    payload.update(overrides)
    return payload


async def _create_menu(client: AsyncClient, headers: dict, **overrides) -> dict:
    response = await client.post("/manage/menus", json=_menu_payload(**overrides), headers=headers)
    assert response.status_code == 200
    assert response.json()["code"] == 0
    return response.json()["data"]


def _find_route(routes: list[dict], route_name: str) -> dict | None:
    for route in routes:
        if route["name"] == route_name:
            return route
        if route.get("children"):
            found = _find_route(route["children"], route_name)
            if found is not None:
                return found
    return None


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

    async def test_user_route_emits_active_menu_for_bound_hidden_child(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        target = await _create_menu(client, auth_headers)
        child = await _create_menu(
            client,
            auth_headers,
            parentId=target["id"],
            hideInMenu=True,
            activeMenu=target["routeName"],
        )

        response = await client.get("/route/user", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["code"] == 0
        route = _find_route(response.json()["data"]["routes"], child["routeName"])
        assert route is not None
        assert route["meta"]["activeMenu"] == target["routeName"]

    async def test_user_route_emits_explicit_null_for_unbound_hidden_child(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        target = await _create_menu(client, auth_headers)
        child = await _create_menu(
            client,
            auth_headers,
            parentId=target["id"],
            hideInMenu=True,
            activeMenu=None,
        )

        response = await client.get("/route/user", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["code"] == 0
        route = _find_route(response.json()["data"]["routes"], child["routeName"])
        assert route is not None
        assert "activeMenu" in route["meta"]
        assert route["meta"]["activeMenu"] is None
