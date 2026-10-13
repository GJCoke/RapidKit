"""Worker authentication supports direct tokens and legacy root sessions."""

from unittest.mock import AsyncMock, patch

import pytest
import socketio
from fastapi_sio_di import AsyncServer as DIAsyncServer
from rapidkit_common.deps import get_redis_client
from src.sio.constants import authenticated_sid_structure

with patch.object(DIAsyncServer, "instrument"):
    from plugin_worker import events


@pytest.mark.asyncio
async def test_worker_connect_resolves_namespace_sid_to_authenticated_root(monkeypatch):
    server = socketio.AsyncServer(async_mode="asgi")
    root_sid = await server.manager.connect("transport", "/")
    worker_sid = await server.manager.connect("transport", "/worker")
    assert root_sid != worker_sid
    monkeypatch.setattr(events, "socket", server)
    redis = AsyncMock()
    redis.exists.side_effect = lambda key: key == authenticated_sid_structure.format(sid=root_sid)
    assert await events.on_worker_connect(worker_sid, redis, None) is None
    redis.exists.assert_awaited_once_with(authenticated_sid_structure.format(sid=root_sid))


@pytest.mark.asyncio
@pytest.mark.parametrize("root_connected,authenticated", [(False, False), (True, False)])
async def test_worker_rejects_missing_or_unauthenticated_root(monkeypatch, root_connected, authenticated):
    server = socketio.AsyncServer(async_mode="asgi")
    if root_connected:
        await server.manager.connect("transport", "/")
    worker_sid = await server.manager.connect("transport", "/worker")
    monkeypatch.setattr(events, "socket", server)
    redis = AsyncMock()
    redis.exists.return_value = authenticated
    assert await events.on_worker_connect(worker_sid, redis, None) is False
    if not root_connected:
        redis.exists.assert_not_awaited()


@pytest.mark.asyncio
async def test_worker_authenticates_token_without_root_namespace(monkeypatch):
    server = DIAsyncServer(async_mode="asgi")
    worker_sid = await server.manager.connect("transport", "/worker")
    monkeypatch.setattr(events, "socket", server)
    provider = AsyncMock()
    provider.get_current_user.return_value = object()
    monkeypatch.setattr(events, "get_service", lambda protocol: provider, raising=False)
    redis = AsyncMock()
    server.dependency_overrides[get_redis_client] = lambda: redis
    server.on("connect", events.on_worker_connect, namespace="/worker")

    handler = server.handlers["/worker"]["connect"]
    assert await handler(worker_sid, {"access_token": "valid-token"}) is None
    provider.get_current_user.assert_awaited_once_with("valid-token")
    redis.exists.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("auth", [{"access_token": "expired"}, {"access_token": ""}, {}, {"access_token": 123}, "invalid"])
async def test_worker_rejects_invalid_auth_even_with_authenticated_root(monkeypatch, auth):
    server = socketio.AsyncServer(async_mode="asgi")
    await server.manager.connect("transport", "/")
    worker_sid = await server.manager.connect("transport", "/worker")
    monkeypatch.setattr(events, "socket", server)
    provider = AsyncMock()
    provider.get_current_user.return_value = None
    monkeypatch.setattr(events, "get_service", lambda protocol: provider, raising=False)
    redis = AsyncMock()
    redis.exists.return_value = True

    assert await events.on_worker_connect(worker_sid, redis, auth) is False
    redis.exists.assert_not_awaited()
