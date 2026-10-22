"""Auth token refresh and logout API tests."""

import math
import time
from typing import cast

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from httpx import AsyncClient
from redis.asyncio import Redis


class TestTokenRefresh:
    async def test_refresh_success(self, client: AsyncClient, init):
        """Login, then refresh the token using the refresh token."""
        from rapidkit_security import encrypt_message, load_public_pem
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
        from plugin_auth.auth_config import auth_settings
        from rapidkit_security import decode_token, encrypt_message, load_public_pem
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


async def login_pair(client):
    from rapidkit_security import encrypt_message, load_public_pem
    from src.initdb import PASSWORD, USERNAME

    key_response = await client.get("/auth/keys/public")
    public = cast(RSAPublicKey, load_public_pem(key_response.json()["data"]))
    response = await client.post(
        "/auth/login", json={"username": USERNAME, "password": encrypt_message(public, PASSWORD)}
    )
    assert response.json()["code"] == 0, response.text
    return response.json()["data"]


async def test_old_tokens_stay_revoked_after_login_in_same_second(client, init, redis, monkeypatch):
    from plugin_auth.auth.token_store import TokenStore
    from plugin_auth.auth_config import auth_settings
    from rapidkit_security import decode_token

    clock = [1760000000.100]
    monkeypatch.setattr(time, "time", lambda: clock[0])
    old = await login_pair(client)
    claims = decode_token(old["accessToken"], auth_settings.ACCESS_TOKEN_KEY)
    clock[0] = 1760000000.500
    await TokenStore(redis).force_relogin(claims.sub)
    clock[0] = 1760000000.900
    new = await login_pair(client)
    for token, expected in [(old["accessToken"], 14003), (new["accessToken"], 0)]:
        response = await client.get("/auth/user/info", headers={"Authorization": "Bearer " + token})
        assert response.json()["code"] == expected, response.text
    response = await client.post("/auth/token/refresh", headers={"X-Refresh-Token": old["refreshToken"]})
    assert response.json()["code"] == 14003
    response = await client.post("/auth/token/refresh", headers={"X-Refresh-Token": new["refreshToken"]})
    assert response.json()["code"] == 0, response.text
    assert await redis.get(f"auth:revoked_before:{claims.sub}") == "1760000000500"


async def test_logout_revokes_only_current_access_until_expiry(client, init, redis):
    from plugin_auth.auth_config import auth_settings
    from rapidkit_security import decode_token

    first, other = await login_pair(client), await login_pair(client)
    claims = decode_token(first["accessToken"], auth_settings.ACCESS_TOKEN_KEY)
    response = await client.post("/auth/logout", headers={"Authorization": "Bearer " + first["accessToken"]})
    assert response.json()["code"] == 0
    for token, expected in [(first["accessToken"], 14003), (other["accessToken"], 0)]:
        response = await client.get("/auth/user/info", headers={"Authorization": "Bearer " + token})
        assert response.json()["code"] == expected, response.text
    ttl = await redis.ttl(f"auth:access_revoked:{claims.jti}")
    assert 0 < ttl <= math.ceil(claims.exp - time.time()) + 1
