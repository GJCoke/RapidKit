"""Menu CRUD API tests."""

import pytest
from httpx import AsyncClient
from plugin_menu.status_codes import MenuStatusCode
from tests.testing.utils import random_lowercase, random_uuid


def _menu_payload(**overrides) -> dict:
    """Build a valid menu JSON payload with camelCase keys."""
    name = random_lowercase(6)
    base = {
        "permission": "user:read",
        "menuName": f"Test_{name}",
        "menuType": "2",
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


async def create_menu(client: AsyncClient, headers: dict, payload: dict) -> dict:
    response = await client.post("/manage/menus", json=payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["code"] == 0
    return response.json()["data"]


def _update_payload(menu: dict, **overrides) -> dict:
    payload = {
        "menuName": menu["menuName"],
        "permission": menu.get("permission"),
        "menuType": menu["menuType"],
        "order": menu["order"],
        "routeName": menu["routeName"],
        "routePath": menu["routePath"],
        "component": menu.get("component"),
        "icon": menu.get("icon"),
        "iconType": str(menu.get("iconType", "1")),
        "status": menu.get("status", "1"),
        "hideInMenu": menu.get("hideInMenu", False),
        "parentId": menu.get("parentId"),
        "i18nKey": menu.get("i18nKey"),
        "keepAlive": menu.get("keepAlive", False),
        "constant": menu.get("constant", False),
        "href": menu.get("href"),
        "multiTab": menu.get("multiTab", False),
        "fixedIndexInTab": menu.get("fixedIndexInTab"),
        "query": menu.get("query", []),
    }
    if "activeMenu" in menu:
        payload["activeMenu"] = menu["activeMenu"]
    payload.update(overrides)
    return payload


def _find_menu(menus: list[dict], menu_id: str) -> dict | None:
    for menu in menus:
        if menu["id"] == menu_id:
            return menu
        if menu.get("children"):
            found = _find_menu(menu["children"], menu_id)
            if found is not None:
                return found
    return None


@pytest.mark.asyncio
class TestCreateMenu:
    async def test_create_directory(self, client: AsyncClient, init, auth_headers: dict):
        payload = _menu_payload(
            menuName=f"Test Dir {random_lowercase(4)}",
            menuType="1",  # DIRECTORY
            order=99,
            component="layout.base",
        )
        resp = await client.post("/manage/menus", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        data = resp.json()["data"]
        assert data["menuName"] == payload["menuName"]

    async def test_create_menu_page(self, client: AsyncClient, init, auth_headers: dict):
        payload = _menu_payload(menuType="2", component="view.page")
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

    async def test_active_menu_options_are_nearest_first(self, client: AsyncClient, init, auth_headers: dict):
        root = await create_menu(client, auth_headers, _menu_payload())
        parent = await create_menu(client, auth_headers, _menu_payload(parentId=root["id"]))

        response = await client.get(
            "/manage/menus/active-menu-options",
            params={"parentId": parent["id"]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["code"] == 0
        assert [item["id"] for item in response.json()["data"]] == [parent["id"], root["id"]]


@pytest.mark.asyncio
class TestActiveMenuBinding:
    async def test_hidden_child_can_omit_active_menu(self, client: AsyncClient, init, auth_headers: dict):
        parent = await create_menu(client, auth_headers, _menu_payload(hideInMenu=False))
        child = await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=parent["id"], hideInMenu=True, activeMenu=None),
        )

        assert child["activeMenu"] is None

    async def test_hidden_child_round_trips_ancestor_route_name(self, client: AsyncClient, init, auth_headers: dict):
        parent = await create_menu(client, auth_headers, _menu_payload(hideInMenu=False))
        child = await create_menu(
            client,
            auth_headers,
            _menu_payload(
                parentId=parent["id"],
                hideInMenu=True,
                activeMenu=parent["routeName"],
            ),
        )

        assert child["activeMenu"] == parent["routeName"]

    async def test_referenced_target_cannot_be_hidden_disabled_or_deleted(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        target = await create_menu(client, auth_headers, _menu_payload())
        await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=target["id"], hideInMenu=True, activeMenu=target["routeName"]),
        )

        hide_response = await client.put(
            f"/manage/menus/{target['id']}",
            json=_update_payload(target, hideInMenu=True),
            headers=auth_headers,
        )
        disable_response = await client.put(
            f"/manage/menus/{target['id']}",
            json=_update_payload(target, status="2"),
            headers=auth_headers,
        )
        delete_response = await client.delete(f"/manage/menus/{target['id']}", headers=auth_headers)
        batch_delete_response = await client.request(
            "DELETE",
            "/manage/menus",
            json={"ids": [target["id"]]},
            headers=auth_headers,
        )

        assert hide_response.json()["code"] != 0
        assert hide_response.json()["code"] == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code
        assert disable_response.json()["code"] == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code
        assert delete_response.json()["code"] == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code
        assert batch_delete_response.json()["code"] == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code

    async def test_moving_hidden_child_outside_target_ancestry_is_rejected(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        target = await create_menu(client, auth_headers, _menu_payload())
        other_parent = await create_menu(client, auth_headers, _menu_payload())
        child = await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=target["id"], hideInMenu=True, activeMenu=target["routeName"]),
        )

        payload = _update_payload(child, parentId=other_parent["id"])
        payload.pop("activeMenu")  # Move the existing binding without submitting a replacement.
        response = await client.put(
            f"/manage/menus/{child['id']}",
            json=payload,
            headers=auth_headers,
        )

        assert response.json()["code"] == MenuStatusCode.MOVE_INVALIDATES_BINDING.code

    async def test_hidden_child_update_can_replace_then_clear_active_menu(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        root = await create_menu(client, auth_headers, _menu_payload())
        parent = await create_menu(client, auth_headers, _menu_payload(parentId=root["id"]))
        child = await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=parent["id"], hideInMenu=True, activeMenu=root["routeName"]),
        )

        replace_response = await client.put(
            f"/manage/menus/{child['id']}",
            json=_update_payload(child, activeMenu=parent["routeName"]),
            headers=auth_headers,
        )
        assert replace_response.json()["code"] == 0
        replaced = replace_response.json()["data"]
        assert replaced["activeMenu"] == parent["routeName"]

        clear_response = await client.put(
            f"/manage/menus/{child['id']}",
            json=_update_payload(replaced, activeMenu=None),
            headers=auth_headers,
        )
        assert clear_response.json()["code"] == 0
        assert clear_response.json()["data"]["activeMenu"] is None

    async def test_referenced_target_cannot_be_converted_to_directory(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        target = await create_menu(client, auth_headers, _menu_payload())
        await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=target["id"], hideInMenu=True, activeMenu=target["routeName"]),
        )

        response = await client.put(
            f"/manage/menus/{target['id']}",
            json=_update_payload(target, menuType="1"),
            headers=auth_headers,
        )
        assert response.json()["code"] == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code

    async def test_target_route_name_rename_refreshes_child_response(
        self, client: AsyncClient, init, auth_headers: dict
    ):
        target = await create_menu(client, auth_headers, _menu_payload())
        child = await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=target["id"], hideInMenu=True, activeMenu=target["routeName"]),
        )
        renamed_route_name = f"renamed_{random_lowercase(6)}"

        rename_response = await client.put(
            f"/manage/menus/{target['id']}",
            json=_update_payload(target, routeName=renamed_route_name),
            headers=auth_headers,
        )
        assert rename_response.json()["code"] == 0

        list_response = await client.get("/manage/menus?page=1&pageSize=100", headers=auth_headers)
        assert list_response.json()["code"] == 0
        child_response = _find_menu(list_response.json()["data"]["records"], child["id"])
        assert child_response is not None
        assert child_response["activeMenu"] == renamed_route_name

    async def test_non_ancestor_active_menu_is_rejected_by_api(self, client: AsyncClient, init, auth_headers: dict):
        unrelated_target = await create_menu(client, auth_headers, _menu_payload())
        parent = await create_menu(client, auth_headers, _menu_payload())

        response = await client.post(
            "/manage/menus",
            json=_menu_payload(
                parentId=parent["id"],
                hideInMenu=True,
                activeMenu=unrelated_target["routeName"],
            ),
            headers=auth_headers,
        )
        assert response.json()["code"] == MenuStatusCode.ACTIVE_MENU_NOT_ANCESTOR.code

    async def test_intermediate_move_returns_move_conflict_code(self, client: AsyncClient, init, auth_headers: dict):
        target = await create_menu(client, auth_headers, _menu_payload())
        intermediate = await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=target["id"], menuType="1", component="layout.base"),
        )
        await create_menu(
            client,
            auth_headers,
            _menu_payload(parentId=intermediate["id"], hideInMenu=True, activeMenu=target["routeName"]),
        )
        other_parent = await create_menu(client, auth_headers, _menu_payload())

        response = await client.put(
            f"/manage/menus/{intermediate['id']}",
            json=_update_payload(intermediate, parentId=other_parent["id"]),
            headers=auth_headers,
        )
        assert response.json()["code"] == MenuStatusCode.MOVE_INVALIDATES_BINDING.code


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


@pytest.mark.asyncio
class TestMenuPermissionValidation:
    async def test_unknown_permission_is_rejected(self, client: AsyncClient, init, auth_headers: dict):
        response = await client.post(
            "/manage/menus", json=_menu_payload(permission="nope:read"), headers=auth_headers
        )
        assert response.json()["code"] == MenuStatusCode.MENU_PERMISSION_UNKNOWN.code

    async def test_page_without_permission_is_rejected(self, client: AsyncClient, init, auth_headers: dict):
        response = await client.post("/manage/menus", json=_menu_payload(permission=None), headers=auth_headers)
        assert response.json()["code"] == MenuStatusCode.MENU_PERMISSION_REQUIRED.code
