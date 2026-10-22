"""WebSocket-only transport and exact JWT expiry at socket admission."""

import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from rapidkit_common.protocols.auth import CurrentUserProvider
from socketio.exceptions import ConnectionRefusedError
from src.sio.identity import authenticate, token_expiry
from starlette.testclient import TestClient


def token(exp):
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return "header." + payload + ".signature"


@pytest.mark.asyncio
async def test_only_websocket_transport_is_admitted():
    from src.sio.app import socket_app

    async with AsyncClient(transport=ASGITransport(app=socket_app), base_url="http://test") as client:
        response = await client.get("/socket.io/?EIO=4&transport=polling")
    assert response.status_code == 400
    with TestClient(socket_app) as client:
        with client.websocket_connect(
            "/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}
        ) as websocket:
            assert websocket.receive_text().startswith('0{"sid":')


@pytest.mark.asyncio
async def test_fractional_expiry_is_preserved_until_actual_deadline(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    provider = SimpleNamespace(
        get_auth_context=AsyncMock(
            return_value=SimpleNamespace(actor=user, subject=user, impersonation_session_id=None)
        )
    )
    monkeypatch.setattr(
        "src.sio.identity.get_service", lambda protocol: provider if protocol is CurrentUserProvider else None
    )
    monkeypatch.setattr("src.sio.identity.time.time", lambda: 1760000000.500)
    signed = token(1760000000.900)
    assert token_expiry(signed) == 1760000000.900
    _, expiry = await authenticate({"access_token": signed})
    assert expiry == 1760000000.900
    monkeypatch.setattr("src.sio.identity.time.time", lambda: 1760000000.900)
    with pytest.raises(ConnectionRefusedError) as error:
        await authenticate({"access_token": signed})
    assert error.value.error_args["message"] == "token_expired"
