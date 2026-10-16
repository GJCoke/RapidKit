import asyncio
import time
from datetime import UTC
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import socketio
from engineio.async_socket import AsyncSocket
from fastapi_sio_di import AsyncServer
from plugin_auth.impersonation.models import EndReason
from plugins.auth.tests.test_impersonation_service import setup_service, start  # noqa: F401
from rapidkit_common.protocols.auth import AuthContext
from rapidkit_core.config import settings
from rapidkit_core.realtime import get_external_sio
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.identity import IdentityMetadata, current_identity
from src.sio import impersonation
from src.sio.identity import IdentityAwareAsyncServer
from src.sio.impersonation import IDENTITY_SESSION_KEY, RedisImpersonationSocketCloser, socket_member, sockets_key

with patch.object(AsyncServer, "instrument"):
    from src.sio.events import connection


@pytest.mark.asyncio
async def test_remote_closer_uses_real_external_server_publish_boundary():
    server = get_external_sio()
    session_id = uuid4()
    redis = AsyncMock()
    redis.smembers.return_value = {socket_member("/", "root"), socket_member("/worker", "worker")}
    with patch.object(server.manager, "_publish", new_callable=AsyncMock) as publish:
        await RedisImpersonationSocketCloser(server).close_session(session_id, redis)
    assert {(c.args[0]["sid"], c.args[0]["namespace"]) for c in publish.await_args_list} == {
        ("root", "/"),
        ("worker", "/worker"),
    }
    redis.delete.assert_awaited_once_with(sockets_key(session_id))


@pytest.mark.asyncio
async def test_event_dispatch_restores_each_sid_identity(monkeypatch):

    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    server = IdentityAwareAsyncServer(async_mode="asgi")
    identities = {"one": IdentityMetadata("subject", "actor", "session"), "two": IdentityMetadata("real", "real")}
    server.get_session = AsyncMock(side_effect=lambda sid, **kw: {IDENTITY_SESSION_KEY: identities[sid]})
    seen = []

    async def dispatch(*args):
        seen.append(current_identity())

    monkeypatch.setattr(AsyncServer, "_handle_event_internal", dispatch)
    for sid in identities:
        await server._handle_event_internal(server, sid, "eio", ["write"], "/", None)
        assert current_identity() == IdentityMetadata()
    assert seen == list(identities.values())


@pytest.mark.asyncio
async def test_expiry_disconnects_local_sid_when_index_is_unavailable(monkeypatch):

    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    server = AsyncMock()
    redis = AsyncMock()
    redis.smembers.side_effect = ConnectionError("offline")
    data = {
        "id": "subject",
        "actor_id": "actor",
        "impersonation_session_id": str(uuid4()),
        "expires_at": int(time.time()) + 1,
    }
    await impersonation.store_socket_identity(server, redis, "local", "/", data)
    timer = impersonation._timers[("/", "local")]

    async def disconnect(sid, namespace, ignore_queue):
        await impersonation.unregister_socket(server, redis, sid, namespace)
        await asyncio.sleep(0)

    server.disconnect.side_effect = disconnect
    server.get_session.return_value = {}
    await timer
    server.disconnect.assert_awaited_once_with("local", namespace="/", ignore_queue=True)
    assert ("/", "local") not in impersonation._timers


@pytest.mark.asyncio
@pytest.mark.parametrize("simulated", [False, True])
async def test_root_mapping_and_online_isolation(monkeypatch, simulated):

    subject = SimpleNamespace(id=uuid4(), name="subject")
    actor = SimpleNamespace(id=uuid4(), name="actor") if simulated else subject
    session_id = uuid4() if simulated else None
    provider = AsyncMock()
    provider.get_auth_context.return_value = AuthContext(subject, actor, session_id)
    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    server = AsyncMock()
    redis = AsyncMock()
    monkeypatch.setattr(connection, "socket", server)
    monkeypatch.setattr(connection, "get_service", lambda protocol: provider)
    monkeypatch.setattr(connection, "session_expiry", AsyncMock(return_value=int(time.time()) + 60))
    assert await connection.connect("sid", connection.AccessToken(access_token="token"), redis) is None
    mapping = redis.hset.await_args.kwargs["mapping"]
    assert mapping["id"] == str(subject.id)
    assert "None" not in mapping.values()
    if simulated:
        assert mapping["actor_id"] == str(actor.id)
        assert mapping["impersonation_session_id"] == str(session_id)
        assert all(c.args[0] != "online_users" for c in redis.sadd.await_args_list)
        server.emit.assert_not_awaited()
        redis.hgetall.return_value = connection.RedisUser.model_validate(mapping)
        server.get_session.return_value = {}
        await connection.disconnect("sid", redis)
        assert all(
            connection.user_sid_structure.format(user_id=subject.id) not in c.args for c in redis.delete.await_args_list
        )
        impersonation._timers.pop(("/", "sid"), None)
    else:
        assert "impersonation_session_id" not in mapping
        redis.sadd.assert_awaited_once_with("online_users", str(subject.id))


@pytest.mark.asyncio
async def test_real_local_disconnect_survives_redis_failure(monkeypatch):

    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    server = IdentityAwareAsyncServer(async_mode="asgi")
    server.eio.sockets["transport"] = AsyncSocket(server.eio, "transport")
    sid = await server.manager.connect("transport", "/")
    monkeypatch.setattr(connection, "socket", server)
    redis = AsyncMock()
    redis.smembers.side_effect = ConnectionError("index down")
    redis.hgetall.side_effect = ConnectionError("hash down")
    redis.srem.side_effect = ConnectionError("remove down")

    async def on_disconnect(sid, reason):
        await connection.disconnect(sid, redis)

    server.on("disconnect", on_disconnect)
    await impersonation.store_socket_identity(
        server,
        redis,
        sid,
        "/",
        {
            "id": "subject",
            "actor_id": "actor",
            "impersonation_session_id": str(uuid4()),
            "expires_at": int(time.time()) + 1,
        },
    )
    timer = impersonation._timers[("/", sid)]
    await timer
    assert not server.manager.is_connected(sid, "/")
    assert ("/", sid) not in impersonation._timers


@pytest.mark.asyncio
async def test_renewal_resolves_engine_id_and_never_extends_impersonation(monkeypatch):

    redis = AsyncMock()
    redis.hgetall.side_effect = [
        connection.RedisUser(id="real", name="real"),
        connection.RedisUser(id="subject", name="sim", impersonation_session_id="session", expires_at=1),
    ]
    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    server = AsyncMock()
    server.eio = SimpleNamespace(sockets={"eio-real": object(), "eio-sim": object()})
    server.manager.sid_from_eio_sid = lambda sid, ns: {"eio-real": "root-real", "eio-sim": "root-sim"}[sid]
    monkeypatch.setattr(connection, "socket", server)
    monkeypatch.setattr(connection.RedisManager, "client", lambda: redis)

    async def finish(interval):
        raise asyncio.CancelledError

    monkeypatch.setattr(connection.asyncio, "sleep", finish)
    # Iteration order is intentionally unspecified; return models by actual requested root SID.
    redis.hgetall.side_effect = lambda key, **kw: (
        connection.RedisUser(id="real", name="real")
        if "root-real" in key
        else connection.RedisUser(id="subject", name="sim", impersonation_session_id="session", expires_at=1)
    )
    with pytest.raises(asyncio.CancelledError):
        await connection.renew_session_keys_loop()
    assert len(redis.expire.await_args_list) == 3
    assert all("eio-" not in c.args[0] and "root-sim" not in c.args[0] for c in redis.expire.await_args_list)
    server.disconnect.assert_awaited_once_with("root-sim")


@pytest.mark.asyncio
async def test_ordinary_real_redis_serialization_disconnect(monkeypatch):
    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    server = IdentityAwareAsyncServer(async_mode="asgi")
    server.eio.sockets["ordinary-transport"] = AsyncSocket(server.eio, "ordinary-transport")
    sid = await server.manager.connect("ordinary-transport", "/")
    user = SimpleNamespace(id=uuid4(), name="ordinary")
    provider = AsyncMock()
    provider.get_auth_context.return_value = AuthContext(user, user)
    monkeypatch.setattr(connection, "socket", server)
    monkeypatch.setattr(connection, "get_service", lambda protocol: provider)
    redis = AsyncRedisClient.from_url(str(settings.REDIS_URL), decode_responses=True)
    await connection.connect(sid, connection.AccessToken(access_token="token"), redis)
    data = await redis.hgetall(connection.sid_user_structure.format(sid=sid))
    assert data == {"id": str(user.id), "name": "ordinary"}
    await connection.disconnect(sid, redis)
    assert not await redis.exists(connection.user_sid_structure.format(user_id=user.id))
    assert not await redis.sismember("online_users", str(user.id))
    await redis.aclose()


@pytest.mark.asyncio
async def test_stop_after_index_rejects_real_library_handshake(setup_service, monkeypatch):  # noqa: F811
    service, users, factory = setup_service
    record = await start(service, users)
    monkeypatch.setattr(impersonation, "AsyncSessionLocal", factory)
    original_validation = impersonation.validate_registered_identity
    server = socketio.AsyncServer(async_mode="asgi")
    server.eio.sockets["race"] = AsyncSocket(server.eio, "race")
    server.environ["race"] = {}
    observed_sid = None

    async def validate_after_stop(data):
        assert await service.redis.scard(impersonation.sockets_key(record.id)) == 1
        await service.end(record.id, EndReason.STOPPED)
        return await original_validation(data)

    monkeypatch.setattr(impersonation, "validate_registered_identity", validate_after_stop)

    async def connect(sid, environ, auth):
        nonlocal observed_sid
        observed_sid = sid
        await impersonation.store_socket_identity(
            server,
            service.redis,
            sid,
            "/",
            {
                "id": str(users[2].id),
                "actor_id": str(users[0].id),
                "impersonation_session_id": str(record.id),
                "expires_at": int(record.expires_at.replace(tzinfo=UTC).timestamp()),
            },
        )

    server.on("connect", connect)
    await server._handle_connect("race", "/", {"token": "validated-before-stop"})
    assert observed_sid is not None
    assert not server.manager.is_connected(observed_sid, "/")
    assert not await service.redis.scard(impersonation.sockets_key(record.id))
    assert ("/", observed_sid) not in impersonation._timers


@pytest.mark.asyncio
async def test_local_expiry_precedes_deferred_remote_cleanup(monkeypatch):
    server = socketio.AsyncServer(async_mode="asgi")
    server.eio.sockets["deferred"] = AsyncSocket(server.eio, "deferred")
    sid = await server.manager.connect("deferred", "/")
    entered = asyncio.Event()
    release = asyncio.Event()

    async def blocked_remote(*args):
        entered.set()
        await release.wait()

    closer = SimpleNamespace(close_session=blocked_remote)
    monkeypatch.setattr(impersonation, "RedisImpersonationSocketCloser", lambda: closer)
    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    await impersonation.store_socket_identity(
        server,
        AsyncMock(),
        sid,
        "/",
        {
            "id": "subject",
            "actor_id": "actor",
            "impersonation_session_id": str(uuid4()),
            "expires_at": int(time.time()) + 1,
        },
    )
    timer = impersonation._timers[("/", sid)]
    await asyncio.wait_for(entered.wait(), timeout=2)
    assert not server.manager.is_connected(sid, "/")
    release.set()
    await timer


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["database", "index"])
async def test_storage_failure_rejects_partial_handshake(monkeypatch, failure):
    server = socketio.AsyncServer(async_mode="asgi")
    server.eio.sockets["failed"] = AsyncSocket(server.eio, "failed")
    server.environ["failed"] = {}
    redis = AsyncMock()
    validator = AsyncMock(return_value=True)
    if failure == "database":
        validator.side_effect = ConnectionError("database unavailable")
    else:
        redis.sadd.side_effect = ConnectionError("index unavailable")
    monkeypatch.setattr(impersonation, "validate_registered_identity", validator)
    observed = []

    async def connect(sid, environ, auth):
        observed.append(sid)
        await impersonation.store_socket_identity(
            server,
            redis,
            sid,
            "/",
            {
                "id": "subject",
                "actor_id": "actor",
                "impersonation_session_id": str(uuid4()),
                "expires_at": int(time.time()) + 60,
            },
        )

    server.on("connect", connect)
    await server._handle_connect("failed", "/", {})
    assert not server.manager.is_connected(observed[0], "/")
    assert ("/", observed[0]) not in impersonation._timers


@pytest.mark.asyncio
async def test_remote_expiry_cleanup_has_a_time_bound(monkeypatch):
    server = socketio.AsyncServer(async_mode="asgi")
    server.eio.sockets["bounded"] = AsyncSocket(server.eio, "bounded")
    sid = await server.manager.connect("bounded", "/")
    entered = asyncio.Event()

    async def remote_never_finishes(*args):
        entered.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(impersonation, "REMOTE_CLEANUP_TIMEOUT_SECONDS", 0.01, raising=False)
    monkeypatch.setattr(
        impersonation, "RedisImpersonationSocketCloser", lambda: SimpleNamespace(close_session=remote_never_finishes)
    )
    monkeypatch.setattr(impersonation, "validate_registered_identity", AsyncMock(return_value=True))
    await impersonation.store_socket_identity(
        server,
        AsyncMock(),
        sid,
        "/",
        {
            "id": "subject",
            "actor_id": "actor",
            "impersonation_session_id": str(uuid4()),
            "expires_at": int(time.time()) + 1,
        },
    )
    timer = impersonation._timers[("/", sid)]
    try:
        await asyncio.wait_for(entered.wait(), 2)
        await asyncio.wait_for(asyncio.shield(timer), 0.2)
        assert not server.manager.is_connected(sid, "/")
        assert ("/", sid) not in impersonation._timers
    finally:
        timer.cancel()
        await asyncio.gather(timer, return_exceptions=True)


@pytest.mark.asyncio
async def test_pending_protected_handshake_cannot_dispatch_business(monkeypatch):
    server = IdentityAwareAsyncServer(async_mode="asgi")
    server.get_session = AsyncMock(return_value={})
    dispatch = AsyncMock()
    monkeypatch.setattr(AsyncServer, "_handle_event_internal", dispatch)
    await server._handle_event_internal(server, "pending", "transport", ["write"], "/worker", None)
    dispatch.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("is_admin,inherited", [(True, True), (False, True), (True, False)])
async def test_dashboard_uses_subject_permission_and_requires_inheritance(monkeypatch, is_admin, inherited):
    events = import_module("plugin_system.events")
    user_id = uuid4()
    server = AsyncMock()
    server.manager = SimpleNamespace(
        eio_sid_from_sid=lambda sid, namespace: "transport",
        sid_from_eio_sid=lambda sid, namespace: "root",
    )
    redis = AsyncMock()
    redis.exists.return_value = 1
    redis.hget.return_value = str(user_id)
    resolver = AsyncMock()
    resolver.get_by_id.return_value = SimpleNamespace(id=user_id, is_admin=is_admin)
    monkeypatch.setattr(events, "socket", server)
    monkeypatch.setattr(events, "get_service", lambda protocol: resolver)
    inherit = AsyncMock(return_value={"id": str(user_id)} if inherited else None)
    monkeypatch.setattr(events, "inherit_root_identity", inherit)
    result = await events.dashboard_connect("dashboard-sid", redis)
    if is_admin and inherited:
        assert result is None
        server.emit.assert_awaited_once()
    else:
        assert result is False
        server.emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_unexpected_connect_failure_uses_library_refusal_cleanup(monkeypatch):
    server = IdentityAwareAsyncServer(async_mode="asgi")
    server.eio.sockets["refused"] = AsyncSocket(server.eio, "refused")
    server.environ["refused"] = {}
    observed = []

    async def fail(self, event, namespace, *args):
        observed.append(args[0])
        raise ConnectionError("authentication storage unavailable")

    monkeypatch.setattr(AsyncServer, "_trigger_event", fail)
    await server._handle_connect("refused", "/", {})
    assert not server.manager.is_connected(observed[0], "/")
