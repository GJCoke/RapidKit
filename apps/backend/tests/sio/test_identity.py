import base64
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi_sio_di import SID, AsyncServer
from rapidkit_common.protocols.auth import AuthContext
from rapidkit_framework.identity import IdentityMetadata, current_identity
from socketio.exceptions import ConnectionRefusedError
from src.sio import identity as module


def token(exp):
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return f"header.{payload}.signature"


@pytest.fixture
def env(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    provider = AsyncMock()
    provider.get_auth_context.return_value = AuthContext(user, user)
    monkeypatch.setattr(module, "get_service", lambda _: provider, raising=False)
    monkeypatch.setattr(module.RedisManager, "client", lambda: AsyncMock())
    register, unregister = AsyncMock(), AsyncMock()
    monkeypatch.setattr(module, "register_socket", register)
    monkeypatch.setattr(module, "unregister_socket", unregister)
    return user, provider, register, unregister


async def test_child_namespace_authenticates_without_root(env):
    server = module.IdentityAwareAsyncServer(async_mode="asgi")
    seen = []

    @server.on("connect", namespace="/notifications")
    async def connect(sid: SID):
        seen.append(current_identity().user_id)

    await server._trigger_event("connect", "/notifications", "sid", {}, {"access_token": token(time.time() + 60)})
    assert seen == [str(env[0].id)]
    assert current_identity() == IdentityMetadata()


@pytest.mark.parametrize(
    "case,want",
    [
        ("missing", "unauthorized"),
        ("expired", "token_expired"),
        ("invalid", "unauthorized"),
        ("forbidden", "forbidden"),
    ],
)
async def test_refusal_reasons(env, case, want):
    server = module.IdentityAwareAsyncServer(async_mode="asgi")

    @server.on("connect", namespace="/worker")
    async def connect(sid: SID):
        return False if case == "forbidden" else None

    auth = {"access_token": token(time.time() - 60 if case == "expired" else time.time() + 60)}
    if case == "missing":
        auth = None
    if case == "invalid":
        env[1].get_auth_context.return_value = None
    with pytest.raises(ConnectionRefusedError) as exc:
        await server._trigger_event("connect", "/worker", "sid", {}, auth)
    assert exc.value.error_args["message"] == want
    env[3].assert_awaited_once()


async def test_disconnect_always_unregisters(env, monkeypatch):
    server = module.IdentityAwareAsyncServer(async_mode="asgi")
    metadata = IdentityMetadata("subject", "actor")
    server.get_session = AsyncMock(return_value={"trusted_identity": metadata})

    async def fail(*args):
        assert current_identity() == metadata
        raise RuntimeError("handler")

    monkeypatch.setattr(AsyncServer, "_trigger_event", fail)
    with pytest.raises(RuntimeError):
        await server._trigger_event("disconnect", "/worker", "sid", "reason")
    env[3].assert_awaited_once()


async def test_chat_events_require_identity(monkeypatch):
    server = module.IdentityAwareAsyncServer(async_mode="asgi")
    server.get_session = AsyncMock(return_value={})
    handler = AsyncMock()
    monkeypatch.setattr(AsyncServer, "_handle_event_internal", handler)
    await server._handle_event_internal(server, "sid", "eio", ["message"], "/chat", None)
    handler.assert_not_awaited()


@pytest.mark.parametrize("value", ["broken", "a.b.c", "a.W10.c", token(True), token(float("inf"))])
def test_invalid_expiry_is_rejected(value):
    assert module.token_expiry(value) is None
