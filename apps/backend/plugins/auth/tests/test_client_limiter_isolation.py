"""Real limiter stays enabled, while each full-app client owns isolated counters."""

import pytest


@pytest.mark.parametrize("request_count", [21, 12])
async def test_public_key_limit_isolated_between_clients(client, request_count, loaded_app, monkeypatch):
    from rapidkit_core.config import settings

    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "20/minute")
    for index in range(request_count):
        response = await client.get("/auth/keys/public")
        expected = 1006 if index == 20 else 0
        assert response.json()["code"] == expected, response.text
        if expected == 1006:
            assert response.json()["data"] is None
