"""Exercise the boundary between Uvicorn's proxy trust and the shared IP reader."""

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from rapidkit_common.request import get_client_ip
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware


@pytest.mark.parametrize(
    "peer, forwarded, expected, scheme",
    [
        ("203.0.113.8", "198.51.100.9", "203.0.113.8", "http"),
        ("172.30.0.2", "198.51.100.9, 203.0.113.8", "203.0.113.8", "https"),
        ("172.30.0.2", "2001:db8::1", "2001:db8::1", "https"),
        ("172.30.0.2", None, "172.30.0.2", "https"),
    ],
)
async def test_only_nginx_peer_can_supply_client_identity(peer, forwarded, expected, scheme):
    app = FastAPI()

    @app.get("/")
    async def identify(request: Request):
        return {"client": get_client_ip(request), "scheme": request.url.scheme}

    headers = {"CF-Connecting-IP": "192.0.2.99", "X-Real-IP": "192.0.2.100", "X-Forwarded-Proto": "https"}
    if forwarded:
        headers["X-Forwarded-For"] = forwarded
    wrapped = ProxyHeadersMiddleware(app, trusted_hosts="172.30.0.0/24")
    async with AsyncClient(transport=ASGITransport(app=wrapped, client=(peer, 1234)), base_url="http://test") as client:
        response = await client.get("/", headers=headers)
    assert response.json() == {"client": expected, "scheme": scheme}
