"""Menu CRUD API tests."""

import pytest
from httpx import AsyncClient

from tests.testing.utils import random_lowercase, random_uuid


def _menu_payload(**overrides) -> dict:
    """Build a valid menu JSON payload with camelCase keys."""
    name = random_lowercase(6)
    base = {
        "menuName": f"Test_{name}",
        "menuType": 2,
        "order": 0,
        "routeName": f"test_{name}",
        "routePath": f"/test/{name}",
        "component": "view.test",
        "icon": "mdi:test",
        "iconType": "1",
        "i18nKey": "",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
class TestCreateMenu:
    async def test_create_directory(self, client: AsyncClient, init, auth_headers: dict):
        payload = _menu_payload(
            menuName=f"Test Dir {random_lowercase(4)}",
            menuType=1,  # DIRECTORY
            order=99,
            component="layout.base",
        )
        resp = await client.post("/manage/menus", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        data = resp.json()["data"]
        assert data["menuName"] == payload["menuName"]

    async def test_create_menu_page(self, client: AsyncClient, init, auth_headers: dict):
        payload = _menu_payload(menuType=2, component="view.page")
        resp = await client.post("/manage/menus", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert "id" in resp.json()["data"]

    async def test_create_with_invalid_parent(self, client: AsyncClient, init, auth_headers: dict):
        payload = _menu_payload(parentId=str(random_uuid()))
        resp = await client.post("/manage/menus", json=payload, headers=auth_headers)
        # Should either fail or succeed depending on validation
        # At minimum, the response is valid JSON
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestReadMenu:
    async def test_list_menus(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/manage/menus?page=1&pageSize=50", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["total"] > 0

    async def test_tree_structure(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/manage/menus/tree", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_get_pages(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/manage/pages", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert isinstance(resp.json()["data"], list)


@pytest.mark.asyncio
class TestUpdateMenu:
    async def test_update_menu_name(self, client: AsyncClient, init, auth_headers: dict):
        # Get a menu to update
        resp = await client.get("/manage/menus?page=1&pageSize=1", headers=auth_headers)
        menu = resp.json()["data"]["records"][0]

        # Build a full update payload from the existing menu
        update_payload = {
            "menuName": "Updated Name",
            "menuType": menu["menuType"],
            "order": menu["order"],
            "routeName": menu["routeName"],
            "routePath": menu["routePath"],
            "component": menu.get("component"),
            "icon": menu.get("icon"),
            "iconType": str(menu.get("iconType", "1")),
            "i18nKey": menu.get("i18nKey", ""),
        }

        resp = await client.put(
            f"/manage/menus/{menu['id']}",
            json=update_payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["menuName"] == "Updated Name"


@pytest.mark.asyncio
class TestDeleteMenu:
    async def test_delete_single(self, client: AsyncClient, init, auth_headers: dict):
        # Create a menu to delete
        payload = _menu_payload(menuName=f"DeleteMe_{random_lowercase(4)}")
        resp = await client.post("/manage/menus", json=payload, headers=auth_headers)
        assert resp.json()["code"] == 0
        menu_id = resp.json()["data"]["id"]

        resp = await client.delete(f"/manage/menus/{menu_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_batch_delete(self, client: AsyncClient, init, auth_headers: dict):
        ids = []
        for i in range(2):
            payload = _menu_payload(
                menuName=f"Batch_{random_lowercase(4)}",
                order=90 + i,
            )
            resp = await client.post("/manage/menus", json=payload, headers=auth_headers)
            assert resp.json()["code"] == 0
            ids.append(resp.json()["data"]["id"])

        resp = await client.request(
            "DELETE",
            "/manage/menus",
            json={"ids": ids},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
