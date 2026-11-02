import asyncio
import json
import time
from unittest.mock import AsyncMock

import pytest
from fastapi_sio_di import SID
from rapidkit_core import log
from rapidkit_core.config import settings
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_framework.identity import IdentityMetadata, current_identity
from socketio import ASGIApp
from socketio.exceptions import ConnectionRefusedError
from src.sio.identity import IdentityAwareAsyncServer
from src.sio.sessions import IDENTITY_SESSION_KEY
from starlette.testclient import TestClient


async def test_concurrent_event_ids_and_trusted_identity_do_not_leak(monkeypatch):
    server = IdentityAwareAsyncServer(async_mode="asgi")
    monkeypatch.setattr(
        server,
        "get_session",
        AsyncMock(side_effect=lambda sid, namespace: {IDENTITY_SESSION_KEY: IdentityMetadata(user_id=sid)}),
    )
    seen = []

    @server.on("slow")
    async def slow(sid: SID, payload: dict):
        seen.append((sid, get_request_nanoid(), current_identity().user_id))
        await asyncio.sleep(0.01)
        assert current_identity().user_id == sid
        return "unchanged"

    monkeypatch.setattr(settings, "SLOW_SOCKET_EVENT_THRESHOLD_MS", 0)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    try:
        await asyncio.gather(
            *(
                server._handle_event_internal(server, sid, sid, ["slow", {"token": "private-socket"}], "/", None)
                for sid in ("first", "second")
            )
        )
        assert len({row[1] for row in seen}) == 2 and all(len(row[1]) == 21 for row in seen)
        events = [row for row in records if row.get("event") == "socket.event.slow"]
        assert len(events) == 2
        assert {row["socket_connection_id"] for row in events} == {"first", "second"}
        assert all(row["socket_event_id"] == row["request_id"] for row in events)
        assert "private-socket" not in json.dumps(records)
        assert not current_identity().user_id and get_request_nanoid() == "-"
    finally:
        log.logger.remove(handler)


def test_real_websocket_rejection_exception_and_safe_diagnostic_notice(monkeypatch):
    from src.sio import identity

    monkeypatch.setattr(settings, "ENVIRONMENT", type(settings.ENVIRONMENT).PRODUCTION)
    server = IdentityAwareAsyncServer(async_mode="asgi", transports=["websocket"])

    async def authenticate(auth, **kwargs):
        if not auth or auth.get("access_token") != "private-auth-token":
            raise ConnectionRefusedError("unauthorized")
        return IdentityMetadata(user_id="trusted-user", actor_id="trusted-actor"), time.time() + 60

    async def register(server, redis, sid, namespace, metadata, expiry):
        await server.save_session(sid, {IDENTITY_SESSION_KEY: metadata}, namespace=namespace)

    monkeypatch.setattr(identity, "authenticate", authenticate)
    monkeypatch.setattr(identity, "register_socket", register)
    monkeypatch.setattr(identity, "unregister_socket", AsyncMock())
    monkeypatch.setattr(identity.RedisManager, "client", lambda: object())

    @server.on("connect")
    async def connect(sid: SID):
        return True

    @server.on("fail")
    async def fail(sid: SID, payload: dict):
        raise RuntimeError("private-handler-message")

    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    try:
        with TestClient(ASGIApp(server)) as client:
            with client.websocket_connect(
                "/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}
            ) as socket:
                assert socket.receive_text().startswith("0")
                socket.send_text('40{"access_token":"private-auth-token"}')
                assert socket.receive_text().startswith("40")
                socket.send_text('42["fail",{"body":"private-body"}]')

                async def receive():
                    return (await asyncio.wait_for(socket._send_rx.receive(), 2))["text"]

                message = socket.portal.call(receive)
                assert "diagnostic:error" in message and "private-" not in message
                notice = json.loads(message[2:])[1]
                assert len(notice["requestId"]) == 21
            with client.websocket_connect(
                "/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}
            ) as socket:
                socket.receive_text()
                socket.send_text('40{"access_token":"private-rejected-token"}')
                assert socket.receive_text().startswith("44")
        events = [row for row in records if row.get("event", "").startswith("socket.")]
        assert {"socket.connected", "socket.disconnected", "socket.auth.rejected", "socket.event.failed"} <= {
            row["event"] for row in events
        }
        assert "private-" not in json.dumps(records)
    finally:
        log.logger.remove(handler)


async def test_renewal_failure_reports_degradation_recovery_and_preserves_cancel(monkeypatch):
    from types import SimpleNamespace

    from src.sio.events import connection

    monkeypatch.setattr(settings, "ENVIRONMENT", type(settings.ENVIRONMENT).PRODUCTION)
    monkeypatch.setattr(connection, "socket", SimpleNamespace(eio=SimpleNamespace(sockets={})))
    monkeypatch.setattr(connection.RedisManager, "client", lambda: object())
    monkeypatch.setattr(connection, "renew_presence", AsyncMock(side_effect=[ConnectionError("private-redis"), None]))
    original_sleep = asyncio.sleep
    cycles = 0

    async def two_cycles(delay):
        nonlocal cycles
        cycles += 1
        if cycles == 2:
            raise asyncio.CancelledError()
        await original_sleep(0)

    monkeypatch.setattr(connection.asyncio, "sleep", two_cycles)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    try:
        with pytest.raises(asyncio.CancelledError):
            await connection.renew_session_keys_loop()
        events = [row["event"] for row in records if row.get("component") == "socket_renewal"]
        assert events == ["component.degraded", "component.recovered"]
        assert "private-redis" not in json.dumps(records)
    finally:
        log.logger.remove(handler)


async def test_socket_failure_sentry_transport_keeps_only_trusted_event_identity(monkeypatch):
    import sentry_sdk
    from sentry_sdk.transport import Transport
    from src.observability import before_send

    events = []

    class MemoryTransport(Transport):
        def capture_envelope(self, envelope):
            event = envelope.get_event()
            if event is not None:
                events.append(event)

    client = sentry_sdk.Client(
        dsn="https://public@example.invalid/1",
        transport=MemoryTransport,
        before_send=before_send,
        send_default_pii=False,
        include_local_variables=False,
        default_integrations=False,
    )
    server = IdentityAwareAsyncServer(async_mode="asgi")
    monkeypatch.setattr(
        server,
        "get_session",
        AsyncMock(
            return_value={IDENTITY_SESSION_KEY: IdentityMetadata(user_id="trusted-subject", actor_id="trusted-actor")}
        ),
    )
    emitted = AsyncMock()
    monkeypatch.setattr(server, "emit", emitted)
    error = RuntimeError("private-socket-body")

    @server.on("fail")
    async def fail(sid: SID):
        raise error

    try:
        with sentry_sdk.isolation_scope() as scope:
            scope.set_client(client)
            with pytest.raises(RuntimeError) as caught:
                await server._handle_event_internal(server, "connection-id", "eio-id", ["fail"], "/", None)
        assert caught.value is error
        assert len(events) == 1
        notice = emitted.call_args.args[1]
        assert events[0]["tags"]["request_id"] == notice["requestId"]
        assert events[0]["user"]["id"] == "trusted-subject"
        assert "private-socket-body" not in json.dumps(events)
    finally:
        client.close()
