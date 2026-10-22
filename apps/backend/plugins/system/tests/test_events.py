from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi_sio_di import AsyncServer
from rapidkit_framework.identity import IdentityMetadata, identity_scope

with patch.object(AsyncServer, "instrument"):
    from plugin_system.dashboard import events


async def test_dashboard_refuses_non_admin(monkeypatch):
    resolver = AsyncMock()
    resolver.get_by_id.return_value = SimpleNamespace(is_admin=False)
    monkeypatch.setattr(events, "get_service", lambda _: resolver)
    with identity_scope(IdentityMetadata(str(uuid4()))):
        assert await events.dashboard_connect("sid", AsyncMock()) is False


async def test_dashboard_admin_receives_online_count(monkeypatch):
    server, redis, resolver = AsyncMock(), AsyncMock(), AsyncMock()
    user_id = uuid4()
    resolver.get_by_id.return_value = SimpleNamespace(is_admin=True)
    redis.scard.return_value = 7
    monkeypatch.setattr(events, "socket", server)
    monkeypatch.setattr(events, "get_service", lambda _: resolver)
    with identity_scope(IdentityMetadata(str(user_id))):
        assert await events.dashboard_connect("sid", redis) is None
    resolver.get_by_id.assert_awaited_once_with(user_id)
    server.emit.assert_awaited_once_with("dashboard:online_users", {"count": 7}, to="sid", namespace="/dashboard")
