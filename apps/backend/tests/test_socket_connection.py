"""Root socket admission requires a user before joining rooms or publishing presence."""

from uuid import uuid4

import pytest
from rapidkit_core.config import settings
from rapidkit_core.realtime import PERMISSION_BROADCAST_ROOM, permission_user_room
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from socketio import AsyncServer
from socketio.exceptions import ConnectionRefusedError
from src.sio.constants import online_users_structure


@pytest.fixture
async def socket_client(monkeypatch):
    # Socket module initialization may start admin tasks; isolate this handler test from them.
    monkeypatch.setattr(settings, "EXPOSE_API_DOCS", False)
    from src.sio.events import connection

    server = AsyncServer(async_mode="asgi")
    monkeypatch.setattr(connection, "socket", server)
    sid = await server.manager.connect("engine-sid", "/")
    return server, sid, connection


@pytest.mark.parametrize("user_id", [None, ""])
async def test_missing_user_is_refused_before_joining_rooms_or_presence(socket_client, redis, user_id):
    server, sid, connection = socket_client
    with identity_scope(IdentityMetadata(user_id=user_id)):
        with pytest.raises(ConnectionRefusedError):
            await connection.connect(sid, redis)
    assert server.manager.get_rooms(sid, "/") == [sid]
    assert await redis.smembers(online_users_structure) == set()


@pytest.mark.parametrize("impersonating", [False, True])
async def test_authenticated_user_joins_rooms_with_only_normal_presence(socket_client, redis, impersonating):
    server, sid, connection = socket_client
    user_id = str(uuid4())
    identity = IdentityMetadata(user_id=user_id, impersonation_session_id=str(uuid4()) if impersonating else None)
    with identity_scope(identity):
        await connection.connect(sid, redis)
    assert set(server.manager.get_rooms(sid, "/")) == {
        sid,
        permission_user_room(user_id),
        PERMISSION_BROADCAST_ROOM,
    }
    assert await redis.smembers(online_users_structure) == (set() if impersonating else {user_id})
