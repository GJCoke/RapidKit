"""Socket.IO notification namespace identity tests."""

from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
import socketio
from fastapi_sio_di import AsyncServer as DIAsyncServer
from src.sio.constants import authenticated_sid_structure, sid_user_structure

with patch.object(DIAsyncServer, "instrument"):
    from plugin_notification import events


class _RootIdentityRedis:
    def __init__(self, root_sid: str, user_id: UUID) -> None:
        self.root_sid = root_sid
        self.user_id = user_id
        self.exists_keys: list[str] = []
        self.hget_calls: list[tuple[str, str]] = []

    async def exists(self, key: str) -> bool:
        self.exists_keys.append(key)
        return key == authenticated_sid_structure.format(sid=self.root_sid)

    async def hget(self, key: str, field: str) -> str | None:
        self.hget_calls.append((key, field))
        if key == sid_user_structure.format(sid=self.root_sid) and field == "id":
            return str(self.user_id)
        return None


class _SessionContext:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *args: object) -> None:
        return None


class _UnreadCountCRUD:
    def __init__(self, _session: object) -> None:
        pass

    async def get_unread_count(self, _user_id: UUID) -> int:
        return 7


class _SocketHarness:
    def __init__(self, manager: Any) -> None:
        self.manager = manager
        self.emitted: list[tuple[str, dict[str, int], str | None, str | None]] = []

    async def enter_room(self, sid: str, room: str, namespace: str | None = None) -> None:
        await self.manager.enter_room(sid, namespace or "/", room)

    async def emit(
        self,
        event: str,
        data: dict[str, int],
        to: str | None = None,
        namespace: str | None = None,
    ) -> None:
        self.emitted.append((event, data, to, namespace))


async def _namespace_connection(monkeypatch: pytest.MonkeyPatch):
    manager_server = socketio.AsyncServer(async_mode="asgi")
    eio_sid = "engine-session"
    root_sid = await manager_server.manager.connect(eio_sid, "/")
    notification_sid = await manager_server.manager.connect(eio_sid, "/notifications")
    assert root_sid is not None
    assert notification_sid is not None
    assert root_sid != notification_sid

    socket_harness = _SocketHarness(manager_server.manager)
    monkeypatch.setattr(events, "socket", socket_harness)
    monkeypatch.setattr(events, "AsyncSessionLocal", _SessionContext)
    monkeypatch.setattr(events, "UserNotificationCRUD", _UnreadCountCRUD)
    return root_sid, notification_sid, socket_harness


@pytest.mark.asyncio
async def test_connect_bridges_namespace_sid_to_root_identity_and_joins_user_room(monkeypatch):
    root_sid, notification_sid, socket_harness = await _namespace_connection(monkeypatch)
    user_id = uuid4()
    redis = _RootIdentityRedis(root_sid, user_id)

    result = await events.notifications_connect(notification_sid, redis)

    assert result is None
    assert redis.exists_keys == [authenticated_sid_structure.format(sid=root_sid)]
    assert redis.hget_calls == [(sid_user_structure.format(sid=root_sid), "id")]
    assert f"notification:user:<{user_id}>" in socket_harness.manager.get_rooms(
        notification_sid, "/notifications"
    )
    assert socket_harness.emitted == [
        ("notification:unread-count", {"count": 7}, notification_sid, "/notifications")
    ]


@pytest.mark.asyncio
async def test_sync_bridges_namespace_sid_to_root_identity(monkeypatch):
    root_sid, notification_sid, socket_harness = await _namespace_connection(monkeypatch)
    redis = _RootIdentityRedis(root_sid, uuid4())

    await events.notifications_sync(notification_sid, redis)

    assert redis.hget_calls == [(sid_user_structure.format(sid=root_sid), "id")]
    assert socket_harness.emitted == [
        ("notification:unread-count", {"count": 7}, notification_sid, "/notifications")
    ]
