"""Real limiter stays enabled, while each full-app client owns isolated counters."""

import pytest


@pytest.mark.parametrize("request_count", [21, 12])
async def test_public_key_limit_isolated_between_clients(client, request_count, loaded_app, monkeypatch):
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from tests.testing.fixtures import pytest_settings

    monkeypatch.setattr(
        loaded_app.state,
        "limiter",
        Limiter(
            key_func=get_remote_address,
            default_limits=["20/minute"],
            storage_uri=pytest_settings.REDIS_DATABASE_URL,
        ),
    )
    for index in range(request_count):
        response = await client.get("/auth/keys/public")
        expected = 1006 if index == 20 else 0
        assert response.json()["code"] == expected, response.text
        if expected == 1006:
            assert response.json()["data"] is None
