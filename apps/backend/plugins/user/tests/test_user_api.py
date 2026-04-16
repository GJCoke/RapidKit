"""User CRUD API tests."""

from typing import cast

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from httpx import AsyncClient

from tests.testing.utils import random_email, random_lowercase, random_uuid


class TestCreateUser:
    async def test_create_success(self, client: AsyncClient, init, auth_headers: dict):
        from rapidkit_core.security import encrypt_message, load_public_pem

        resp = await client.get("/auth/keys/public")
        pub_key = cast(RSAPublicKey, load_public_pem(resp.json()["data"]))

        username = random_lowercase(8)
        resp = await client.post(
            "/users",
            json={
                "name": f"Test {username}",
                "username": username,
                "email": random_email(),
                "password": encrypt_message(pub_key, "Test123456!"),
                "roles": ["GUEST"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["username"] == username

    async def test_create_duplicate_username(self, client: AsyncClient, init, auth_headers: dict):
        from rapidkit_core.security import encrypt_message, load_public_pem
        from src.initdb import USERNAME

        resp = await client.get("/auth/keys/public")
        pub_key = cast(RSAPublicKey, load_public_pem(resp.json()["data"]))

        resp = await client.post(
            "/users",
            json={
                "name": "Duplicate",
                "username": USERNAME,  # "admin" already exists
                "email": random_email(),
                "password": encrypt_message(pub_key, "Test123456!"),
                "roles": ["GUEST"],
            },
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0


class TestReadUser:
    async def test_list_paginated(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/users?page=1&pageSize=10", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["total"] >= 2  # admin + guest

    async def test_get_by_id(self, client: AsyncClient, init, auth_headers: dict):
        # Get user list first
        resp = await client.get("/users?page=1&pageSize=1", headers=auth_headers)
        user_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.get(f"/users/{user_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["id"] == user_id

    async def test_get_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(f"/users/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0


class TestUpdateUser:
    async def test_update_name(self, client: AsyncClient, init, auth_headers: dict):
        # Get guest user
        resp = await client.get("/users?page=1&pageSize=10", headers=auth_headers)
        guest = next(u for u in resp.json()["data"]["records"] if u["username"] == "guest")

        resp = await client.put(
            f"/users/{guest['id']}",
            json={"name": "Updated Guest"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["name"] == "Updated Guest"

    async def test_update_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.put(
            f"/users/{random_uuid()}",
            json={"name": "Ghost"},
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0


class TestDeleteUser:
    async def test_cannot_delete_self(self, client: AsyncClient, init, auth_headers: dict):
        """Admin cannot delete themselves."""
        # Get current admin user id
        resp = await client.get("/auth/user/info", headers=auth_headers)
        admin_id = resp.json()["data"]["id"]

        resp = await client.delete(f"/users/{admin_id}", headers=auth_headers)
        assert resp.json()["code"] != 0  # BAD_REQUEST

    async def test_cannot_delete_admin(self, client: AsyncClient, init, auth_headers: dict):
        """Cannot delete another admin user."""
        # The initdb only creates one admin, so this is effectively "can't delete admin"
        resp = await client.get("/users?page=1&pageSize=10", headers=auth_headers)
        admin_user = next(u for u in resp.json()["data"]["records"] if u["isAdmin"])

        resp = await client.delete(f"/users/{admin_user['id']}", headers=auth_headers)
        assert resp.json()["code"] != 0

    async def test_delete_regular_user(self, client: AsyncClient, init, auth_headers: dict):
        """Delete a non-admin user succeeds."""
        from rapidkit_core.security import encrypt_message, load_public_pem

        resp = await client.get("/auth/keys/public")
        pub_key = cast(RSAPublicKey, load_public_pem(resp.json()["data"]))

        # Create a disposable user
        username = random_lowercase(8)
        resp = await client.post(
            "/users",
            json={
                "name": f"Delete Me {username}",
                "username": username,
                "email": random_email(),
                "password": encrypt_message(pub_key, "Test123456!"),
                "roles": ["GUEST"],
            },
            headers=auth_headers,
        )
        user_id = resp.json()["data"]["id"]

        resp = await client.delete(f"/users/{user_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_delete_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.delete(f"/users/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0

    async def test_batch_delete(self, client: AsyncClient, init, auth_headers: dict):
        from rapidkit_core.security import encrypt_message, load_public_pem

        resp = await client.get("/auth/keys/public")
        pub_key = cast(RSAPublicKey, load_public_pem(resp.json()["data"]))

        ids = []
        for _ in range(2):
            username = random_lowercase(8)
            resp = await client.post(
                "/users",
                json={
                    "name": f"Batch {username}",
                    "username": username,
                    "email": random_email(),
                    "password": encrypt_message(pub_key, "Test123456!"),
                    "roles": ["GUEST"],
                },
                headers=auth_headers,
            )
            ids.append(resp.json()["data"]["id"])

        resp = await client.request(
            "DELETE",
            "/users",
            json={"ids": ids},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
