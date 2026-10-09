"""Worker namespace authentication must use the root namespace identity."""

from unittest.mock import AsyncMock, patch

import pytest
import socketio
from fastapi_sio_di import AsyncServer as DIAsyncServer
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
    assert await events.on_worker_connect(worker_sid, redis) is None
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
    assert await events.on_worker_connect(worker_sid, redis) is False
    if not root_connected:
        redis.exists.assert_not_awaited()
