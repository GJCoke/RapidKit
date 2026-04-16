"""Auth login API integration tests."""

import pytest
from httpx import AsyncClient

from tests.testing.utils import random_lowercase


class TestGetPublicKey:
    async def test_returns_valid_pem(self, client: AsyncClient):
        resp = await client.get("/auth/keys/public")
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        pem = resp.json()["data"]
        assert pem.startswith("-----BEGIN PUBLIC KEY-----")

    async def test_pem_loadable_as_rsa(self, client: AsyncClient):
        from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
        from rapidkit_core.security import load_public_pem

        resp = await client.get("/auth/keys/public")
        pem = resp.json()["data"]
        key = load_public_pem(pem)
        assert isinstance(key, RSAPublicKey)


class TestLogin:
    @pytest.fixture
    async def rsa_public_key(self, client: AsyncClient):
        from rapidkit_core.security import load_public_pem

        resp = await client.get("/auth/keys/public")
        return load_public_pem(resp.json()["data"])

    async def test_login_success(self, client: AsyncClient, init, rsa_public_key):
        from rapidkit_core.security import encrypt_message
        from src.initdb import PASSWORD, USERNAME

        resp = await client.post(
            "/auth/login",
            json={"username": USERNAME, "password": encrypt_message(rsa_public_key, PASSWORD)},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "accessToken" in body["data"]
        assert "refreshToken" in body["data"]

    async def test_login_wrong_password(self, client: AsyncClient, init, rsa_public_key):
        from rapidkit_core.security import encrypt_message
        from src.initdb import USERNAME

        resp = await client.post(
            "/auth/login",
            json={"username": USERNAME, "password": encrypt_message(rsa_public_key, "wrong_password")},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] != 0

    async def test_login_nonexistent_user(self, client: AsyncClient, init, rsa_public_key):
        from rapidkit_core.security import encrypt_message

        resp = await client.post(
            "/auth/login",
            json={"username": random_lowercase(12), "password": encrypt_message(rsa_public_key, "any")},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] != 0

    async def test_get_user_info_after_login(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/auth/user/info", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["username"] == "admin"
        assert body["data"]["isAdmin"] is True
