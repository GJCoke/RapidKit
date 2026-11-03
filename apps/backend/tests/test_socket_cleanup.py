"""Disconnect cleanup remains quiet when repeated and reports real faults safely."""

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from engineio.async_socket import AsyncSocket
from rapidkit_core.config import settings
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from redis.exceptions import ConnectionError
from socketio import AsyncServer
from src.sio import sessions
from src.sio.constants import online_users_structure, presence_structure, user_sockets_structure
from src.sio.presence import mark_online


@pytest.fixture
async def cleanup_socket(monkeypatch):
    monkeypatch.setattr(settings, "EXPOSE_API_DOCS", False)
    from src.sio.events import connection

    server = AsyncServer(async_mode="asgi")
    server.eio.sockets["cleanup-engine"] = AsyncSocket(server.eio, "cleanup-engine")
    sid = await server.manager.connect("cleanup-engine", "/")
    monkeypatch.setattr(connection, "socket", server)
    rows = []
    handler = logger.add(lambda message: rows.append(message.record), level="WARNING")
    try:
        yield server, sid, connection, rows
    finally:
        await sessions.shutdown_socket_timers()
        logger.remove(handler)


async def test_missing_session_cancels_timer_without_false_warning(cleanup_socket, redis):
    server, sid, _, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()))
    await sessions.register_socket(server, redis, sid, "/", identity, time.time() + 60)
    server.eio.sockets.clear()
    await sessions.unregister_socket(server, redis, sid, "/")
    await asyncio.sleep(0)
    assert ("/", sid) not in sessions._timers
    assert rows == []


async def test_duplicate_cleanup_preserves_other_namespaces_users_and_session_indexes(cleanup_socket, redis):
    server, sid, _, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()), impersonation_session_id=str(uuid4()))
    member = sessions.socket_member("/", sid)
    other_namespace = sessions.socket_member("/dashboard", sid)
    user_key = user_sockets_structure.format(user_id=identity.user_id)
    impersonation_key = sessions.sockets_key(identity.impersonation_session_id)
    other_user_key = user_sockets_structure.format(user_id=str(uuid4()))
    for key in (user_key, impersonation_key, other_user_key):
        await redis.sadd(key, member, other_namespace)
    await server.save_session(sid, {sessions.IDENTITY_SESSION_KEY: identity}, namespace="/")
    await sessions.unregister_socket(server, redis, sid, "/")
    await sessions.unregister_socket(server, redis, sid, "/")
    assert await redis.smembers(user_key) == {other_namespace}
    assert await redis.smembers(impersonation_key) == {other_namespace}
    assert await redis.smembers(other_user_key) == {member, other_namespace}
    assert sessions.IDENTITY_SESSION_KEY not in await server.get_session(sid)
    assert rows == []


@pytest.mark.parametrize("error_type", [ConnectionError, KeyError])
async def test_real_index_failure_is_not_mistaken_for_missing_session(cleanup_socket, redis, monkeypatch, error_type):
    server, sid, _, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()))
    await server.save_session(sid, {sessions.IDENTITY_SESSION_KEY: identity})
    monkeypatch.setattr(redis, "srem", AsyncMock(side_effect=error_type("private-redis-credential")))
    await sessions.unregister_socket(server, redis, sid, "/")
    assert len(rows) == 1
    assert rows[0]["extra"]["exception_type"] == error_type.__name__
    assert "exception_type=" + error_type.__name__ in rows[0]["message"]
    assert identity.user_id in rows[0]["message"]
    assert "private-redis-credential" not in str(rows)


async def test_disconnect_failure_reports_safe_type(cleanup_socket, redis, monkeypatch):
    _, sid, connection, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()))
    monkeypatch.setattr(redis, "zrem", AsyncMock(side_effect=ConnectionError("private-redis-credential")))
    with identity_scope(identity):
        await connection.disconnect(sid, redis)
    assert len(rows) == 1
    assert rows[0]["extra"]["exception_type"] == "ConnectionError"
    assert "exception_type=ConnectionError" in rows[0]["message"]
    assert "private-redis-credential" not in str(rows)


async def test_rejected_admission_cleanup_reports_safe_type(cleanup_socket, redis, monkeypatch):
    server, sid, _, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()))
    monkeypatch.setattr(server, "save_session", AsyncMock(side_effect=ValueError("admission-failed")))
    monkeypatch.setattr(redis, "srem", AsyncMock(side_effect=ConnectionError("private-redis-credential")))
    with pytest.raises(ValueError, match="admission-failed"):
        await sessions.register_socket(server, redis, sid, "/", identity, time.time() + 60)
    assert len(rows) == 1
    assert rows[0]["extra"]["exception_type"] == "ConnectionError"
    assert "exception_type=ConnectionError" in rows[0]["message"]
    assert "private-redis-credential" not in str(rows)


async def test_remote_expiry_cleanup_reports_safe_type(cleanup_socket, redis, monkeypatch):
    server, sid, _, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()), actor_id=str(uuid4()), impersonation_session_id=str(uuid4()))
    monkeypatch.setattr(
        sessions, "get_service", lambda _: SimpleNamespace(validate_identity=AsyncMock(return_value=True))
    )
    monkeypatch.setattr(sessions, "get_external_sio", lambda: server)
    monkeypatch.setattr(
        sessions.RedisSocketCloser, "close_session", AsyncMock(side_effect=ConnectionError("private-redis-credential"))
    )
    await sessions.register_socket(server, redis, sid, "/", identity, time.time() + 0.02)
    await asyncio.wait_for(sessions._timers[("/", sid)], 1)
    assert len(rows) == 1
    assert rows[0]["extra"]["exception_type"] == "ConnectionError"
    assert "exception_type=ConnectionError" in rows[0]["message"]
    assert "private-redis-credential" not in str(rows)


@pytest.mark.parametrize("stage", ["presence", "identity"])
async def test_cleanup_cancellation_propagates_without_failure_warning(cleanup_socket, redis, monkeypatch, stage):
    server, sid, connection, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()))
    await server.save_session(sid, {sessions.IDENTITY_SESSION_KEY: identity})
    monkeypatch.setattr(
        redis, "zrem" if stage == "presence" else "srem", AsyncMock(side_effect=asyncio.CancelledError())
    )
    with identity_scope(identity), pytest.raises(asyncio.CancelledError):
        if stage == "presence":
            await connection.disconnect(sid, redis)
        else:
            await sessions.unregister_socket(server, redis, sid, "/")
    assert rows == []


async def test_full_pool_disconnect_waits_then_cleans_only_its_socket(cleanup_socket, redis, monkeypatch):
    server, sid, connection, rows = cleanup_socket
    monkeypatch.setattr(RedisManager, "_pools", {})
    monkeypatch.setattr(RedisManager, "_clients", {})
    pool = RedisManager.connect(max_connections=2)
    client = RedisManager.client()
    identity = IdentityMetadata(user_id=str(uuid4()))
    borrowed, task = [], None
    try:
        await sessions.register_socket(server, client, sid, "/", identity, time.time() + 60)
        await mark_online(client, identity.user_id, sid)
        await mark_online(client, identity.user_id, "other-tab")
        borrowed = [await pool.get_connection() for _ in range(2)]

        async def disconnect():
            with identity_scope(identity):
                await connection.disconnect(sid, client)
            await sessions.unregister_socket(server, client, sid, "/")

        task = asyncio.create_task(disconnect())
        await asyncio.sleep(0.02)
        assert not task.done()
        for item in borrowed:
            await pool.release(item)
        borrowed.clear()
        await asyncio.wait_for(task, 1)
        assert await client.smembers(user_sockets_structure.format(user_id=identity.user_id)) == set()
        assert await client.zrange(presence_structure.format(user_id=identity.user_id), 0, -1) == ["other-tab"]
        assert await client.sismember(online_users_structure, identity.user_id)
        assert rows == []
    finally:
        for item in borrowed:
            await pool.release(item)
        if task is not None:
            await asyncio.gather(task, return_exceptions=True)
        await RedisManager.clear()


async def test_expiry_finishes_its_own_disconnect_cleanup(cleanup_socket, redis):
    server, sid, connection, rows = cleanup_socket
    identity = IdentityMetadata(user_id=str(uuid4()))

    async def disconnected(sid, reason):
        with identity_scope(identity):
            await connection.disconnect(sid, redis)
        await sessions.unregister_socket(server, redis, sid, "/")

    server.on("disconnect", disconnected)
    await mark_online(redis, identity.user_id, sid)
    await sessions.register_socket(server, redis, sid, "/", identity, time.time() + 0.02)
    timer = sessions._timers[("/", sid)]
    await asyncio.wait_for(timer, 1)
    assert not timer.cancelled()
    assert not server.manager.is_connected(sid, "/")
    assert not await redis.smembers(user_sockets_structure.format(user_id=identity.user_id))
    assert not await redis.sismember(online_users_structure, identity.user_id)
    assert rows == []
