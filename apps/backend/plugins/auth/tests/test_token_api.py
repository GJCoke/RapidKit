"""Auth token refresh and logout API tests."""

from typing import cast

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from httpx import AsyncClient
from redis.asyncio import Redis


class TestTokenRefresh:
    async def test_refresh_success(self, client: AsyncClient, init):
        """Login, then refresh the token using the refresh token."""
        from rapidkit_core.security import encrypt_message, load_public_pem
        from src.initdb import PASSWORD, USERNAME

        # Login first
        resp = await client.get("/auth/keys/public")
        public_key = cast(RSAPublicKey, load_public_pem(resp.json()["data"]))

        resp = await client.post(
            "/auth/login",
            json={"username": USERNAME, "password": encrypt_message(public_key, PASSWORD)},
        )
        assert resp.json()["code"] == 0
        refresh_token = resp.json()["data"]["refreshToken"]

        # Refresh — the endpoint reads the refresh token from the x-refresh-token header
        # and also requires User-Agent (matched against the token's embedded agent).
        resp = await client.post(
            "/auth/token/refresh",
            headers={"x-refresh-token": refresh_token},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "accessToken" in body["data"]
        assert "refreshToken" in body["data"]
        # New tokens should be different
        assert body["data"]["refreshToken"] != refresh_token

    async def test_refresh_with_invalid_token(self, client: AsyncClient, init):
        """Refresh with an invalid token should fail."""
        resp = await client.post(
            "/auth/token/refresh",
            headers={"x-refresh-token": "invalid.token.value"},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] != 0


class TestLogout:
    async def test_logout_clears_redis(self, client: AsyncClient, init, redis: Redis):
        """Logout should remove the refresh token from Redis."""
        from plugin_auth.auth.deps import refresh_structure
        from rapidkit_core.auth_config import auth_settings
        from rapidkit_core.security import decode_token, encrypt_message, load_public_pem
        from src.initdb import PASSWORD, USERNAME

        # Login
        resp = await client.get("/auth/keys/public")
        public_key = cast(RSAPublicKey, load_public_pem(resp.json()["data"]))

        resp = await client.post(
            "/auth/login",
            json={"username": USERNAME, "password": encrypt_message(public_key, PASSWORD)},
        )
        access_token = resp.json()["data"]["accessToken"]
        jwt_data = decode_token(access_token, auth_settings.ACCESS_TOKEN_KEY)

        # Logout
        resp = await client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

        # Verify Redis key was deleted
        redis_key = refresh_structure.format(user_id=jwt_data.sub, jti=jwt_data.jti)
        exists = await redis.exists(redis_key)
        assert exists == 0

    async def test_logout_without_token(self, client: AsyncClient, init):
        """Logout without auth header should fail."""
        resp = await client.post("/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["code"] != 0
