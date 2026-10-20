from unittest.mock import patch

import httpx
from fastapi_sio_di import AsyncServer
from socketio import ASGIApp
from src.sio.identity import IdentityAwareAsyncServer

with patch.object(AsyncServer, "instrument"):
    from src.sio.app import socket_cors_origins


def test_explicit_wildcard():
    assert socket_cors_origins(["*"], None, False) == "*"


def test_exact_origins():
    assert socket_cors_origins(["https://a.com"], None, False) == ["https://a.com"]


def test_debug_admin_origin_without_mutating_config():
    origins = ["https://a.com"]
    assert socket_cors_origins(origins, None, True) == ["https://a.com", "https://admin.socket.io"]
    assert origins == ["https://a.com"]


def test_regex_and_exact_and_debug():
    check = socket_cors_origins(["https://a.com"], r"https://.*\.a\.com", True)
    assert check("https://x.a.com")
    assert check("https://a.com")
    assert check("https://admin.socket.io")
    assert not check("https://evil.com")
    assert not check("https://x.a.com.evil.com")


async def test_empty_cors_rejects_cross_origin_but_allows_same_origin():
    server = IdentityAwareAsyncServer(async_mode="asgi", cors_allowed_origins=socket_cors_origins([], None, False))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=ASGIApp(server)), base_url="http://server.test"
    ) as client:
        cross = await client.get("/socket.io/?EIO=4&transport=polling", headers={"Origin": "http://evil.test"})
        same = await client.get("/socket.io/?EIO=4&transport=polling", headers={"Origin": "http://server.test"})
    assert cross.status_code == 400
    assert same.status_code == 200
    await server.shutdown()
