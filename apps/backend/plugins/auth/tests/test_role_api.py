"""Role CRUD API tests."""

from httpx import AsyncClient

from tests.testing.utils import random_lowercase, random_uuid


class TestCreateRole:
    async def test_create_success(self, client: AsyncClient, init, auth_headers: dict):
        code = random_lowercase(8).upper()
        resp = await client.post(
            "/roles",
            json={"name": f"role_{code}", "code": code, "description": "test role"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["code"] == code

    async def test_create_duplicate_code(self, client: AsyncClient, init, auth_headers: dict):
        code = random_lowercase(8).upper()
        # Create first
        await client.post(
            "/roles",
            json={"name": f"role_{code}", "code": code, "description": "test"},
            headers=auth_headers,
        )
        # Create duplicate
        resp = await client.post(
            "/roles",
            json={"name": f"role_{code}_2", "code": code, "description": "dup"},
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0  # ALREADY_EXISTS


class TestReadRole:
    async def test_list_paginated(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/roles?page=1&pageSize=10", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "records" in body["data"]
        assert body["data"]["total"] >= 2  # admin + guest from initdb

    async def test_get_all(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/roles/all", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)
        assert len(body["data"]) >= 2

    async def test_get_role_permissions(self, client: AsyncClient, init, auth_headers: dict):
        # Get roles list first
        resp = await client.get("/roles/all", headers=auth_headers)
        roles = resp.json()["data"]
        admin_role = next(r for r in roles if r["code"] == "ADMIN")

        resp = await client.get(f"/roles/{admin_role['id']}/permissions", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "buttonPermissions" in body["data"]

    async def test_get_my_roles(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/roles/mine", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)


class TestUpdateRole:
    async def test_update_role_name(self, client: AsyncClient, init, auth_headers: dict):
        # Create a role
        code = random_lowercase(8).upper()
        resp = await client.post(
            "/roles",
            json={"name": "original", "code": code, "description": "test"},
            headers=auth_headers,
        )
        role_id = resp.json()["data"]["id"]

        # Update — RoleUpdate requires all RoleSchema fields (name, code, description)
        resp = await client.put(
            f"/roles/{role_id}",
            json={"name": "updated_name", "code": code, "description": "test"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["name"] == "updated_name"

    async def test_update_permissions(self, client: AsyncClient, init, auth_headers: dict):
        # Get guest role
        resp = await client.get("/roles/all", headers=auth_headers)
        guest = next(r for r in resp.json()["data"] if r["code"] == "GUEST")

        resp = await client.put(
            f"/roles/{guest['id']}/permissions",
            json={
                "routerPermissions": ["home"],
                "buttonPermissions": [],
                "interfacePermissions": ["GET:/api/v1/users"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0


class TestDeleteRole:
    async def test_delete_single(self, client: AsyncClient, init, auth_headers: dict):
        code = random_lowercase(8).upper()
        resp = await client.post(
            "/roles",
            json={"name": f"to_delete_{code}", "code": code, "description": "temp"},
            headers=auth_headers,
        )
        role_id = resp.json()["data"]["id"]

        resp = await client.delete(f"/roles/{role_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_batch_delete(self, client: AsyncClient, init, auth_headers: dict):
        ids = []
        for _ in range(2):
            code = random_lowercase(8).upper()
            resp = await client.post(
                "/roles",
                json={"name": f"batch_{code}", "code": code, "description": "temp"},
                headers=auth_headers,
            )
            ids.append(resp.json()["data"]["id"])

        resp = await client.request(
            "DELETE",
            "/roles",
            json={"ids": ids},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_delete_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.delete(f"/roles/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0
