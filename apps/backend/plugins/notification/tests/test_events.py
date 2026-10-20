from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi_sio_di import AsyncServer
from rapidkit_framework.identity import IdentityMetadata, identity_scope

with patch.object(AsyncServer, "instrument"):
    from plugin_notification import events


@pytest.fixture
def harness(monkeypatch):
    server, crud, session = AsyncMock(), AsyncMock(), AsyncMock()
    crud.get_unread_count.return_value = 7
    monkeypatch.setattr(events, "socket", server)
    monkeypatch.setattr(events, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(events, "UserNotificationCRUD", lambda _: crud)
    return server, crud


async def test_connect_joins_user_room_from_session_identity(harness):
    server, crud = harness
    user_id = uuid4()
    with identity_scope(IdentityMetadata(str(user_id))):
        assert await events.notifications_connect("sid") is None
    server.enter_room.assert_any_await("sid", f"notification:user:<{user_id}>", namespace="/notifications")
    server.enter_room.assert_any_await("sid", "announcement:authenticated", namespace="/notifications")
    crud.get_unread_count.assert_awaited_once_with(user_id)
    server.emit.assert_awaited_once_with(
        "notification:unread-count", {"count": 7}, to="sid", namespace="/notifications"
    )


async def test_sync_uses_session_identity(harness):
    server, crud = harness
    user_id = uuid4()
    with identity_scope(IdentityMetadata(str(user_id))):
        await events.notifications_sync("sid")
    crud.get_unread_count.assert_awaited_once_with(user_id)
    server.emit.assert_awaited_once_with(
        "notification:unread-count", {"count": 7}, to="sid", namespace="/notifications"
    )
