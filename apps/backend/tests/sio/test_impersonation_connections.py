import asyncio
import time
from datetime import UTC
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import socketio
from engineio.async_socket import AsyncSocket
from fastapi_sio_di import AsyncServer
from plugin_auth.impersonation.models import EndReason
from plugin_auth.impersonation.session_reader import ImpersonationSessionReaderImpl
from plugins.auth.tests.test_impersonation_service import setup_service, start  # noqa: F401
from rapidkit_core.realtime import get_external_sio
from rapidkit_framework.identity import IdentityMetadata, current_identity, identity_scope
from src.sio import sessions
from src.sio.identity import IdentityAwareAsyncServer

with patch.object(AsyncServer, 'instrument'):
    from src.sio.events import connection


@pytest.fixture(autouse=True)
async def reader(monkeypatch):
    service = AsyncMock()
    service.validate_identity.return_value = True
    monkeypatch.setattr(sessions, 'get_service', lambda _: service)
    yield service
    await sessions.shutdown_socket_timers()


def simulated_identity():
    return IdentityMetadata(str(uuid4()), str(uuid4()), str(uuid4()))


async def test_remote_closer_uses_real_external_server_publish_boundary():
    server = get_external_sio()
    session_id = uuid4()
    redis = AsyncMock()
    redis.smembers.return_value = {sessions.socket_member('/', 'root'), sessions.socket_member('/worker', 'worker')}
    with patch.object(server.manager, '_publish', new_callable=AsyncMock) as publish:
        await sessions.RedisSocketCloser(server).close_session(session_id, redis)
    commands = [c.args[0] for c in publish.await_args_list]
    assert {(c['sid'], c['namespace']) for c in commands if c['method'] == 'disconnect'} == {('root', '/'), ('worker', '/worker')}
    assert sum(c['method'] == 'emit' for c in commands) == 2
    redis.delete.assert_awaited_once_with(sessions.sockets_key(session_id))


async def test_event_dispatch_restores_each_sid_identity(monkeypatch):
    server = IdentityAwareAsyncServer(async_mode='asgi')
    identities = {'one': simulated_identity(), 'two': IdentityMetadata('real', 'real')}
    server.get_session = AsyncMock(side_effect=lambda sid, **kw: {'trusted_identity': identities[sid]})
    seen = []

    async def dispatch(*args):
        seen.append(current_identity())

    monkeypatch.setattr(AsyncServer, '_handle_event_internal', dispatch)
    for sid in identities:
        await server._handle_event_internal(server, sid, 'eio', ['write'], '/', None)
        assert current_identity() == IdentityMetadata()
    assert seen == list(identities.values())


async def test_expiry_disconnects_local_sid_when_index_is_unavailable():
    server, redis = AsyncMock(), AsyncMock()
    redis.smembers.side_effect = ConnectionError('offline')
    metadata = simulated_identity()
    await sessions.register_socket(server, redis, 'local', '/', metadata, int(time.time()) + 1)
    timer = sessions._timers[('/', 'local')]

    async def disconnect(sid, namespace, ignore_queue):
        await sessions.unregister_socket(server, redis, sid, namespace)
        await asyncio.sleep(0)

    server.disconnect.side_effect = disconnect
    server.get_session.return_value = {'trusted_identity': metadata}
    await timer
    server.disconnect.assert_awaited_once_with('local', namespace='/', ignore_queue=True)
    assert ('/', 'local') not in sessions._timers


@pytest.mark.parametrize('simulated', [False, True])
async def test_root_mapping_and_online_isolation(monkeypatch, simulated):
    server, redis = AsyncMock(), AsyncMock()
    metadata = simulated_identity() if simulated else IdentityMetadata(str(uuid4()))
    monkeypatch.setattr(connection, 'socket', server)
    with identity_scope(metadata):
        await connection.connect('sid', redis)
        await connection.disconnect('sid', redis)
    if simulated:
        redis.zadd.assert_not_awaited()
        redis.sadd.assert_not_awaited()
        server.emit.assert_not_awaited()
    else:
        redis.sadd.assert_awaited_once_with('online_users', metadata.user_id)
        assert server.emit.await_count == 2


async def test_real_local_disconnect_survives_redis_failure(monkeypatch):
    server = IdentityAwareAsyncServer(async_mode='asgi')
    server.eio.sockets['transport'] = AsyncSocket(server.eio, 'transport')
    sid = await server.manager.connect('transport', '/')
    redis = AsyncMock()
    redis.srem.side_effect = ConnectionError('remove down')
    monkeypatch.setattr(connection, 'socket', server)
    monkeypatch.setattr('src.sio.identity.RedisManager.client', lambda: redis)

    @server.on('disconnect')
    async def on_disconnect(sid: str):
        await connection.disconnect(sid, redis)

    await sessions.register_socket(server, redis, sid, '/', simulated_identity(), int(time.time()) + 1)
    await sessions._timers[('/', sid)]
    assert not server.manager.is_connected(sid, '/')
    assert ('/', sid) not in sessions._timers


async def test_renewal_resolves_engine_id_and_never_extends_impersonation(monkeypatch):
    server = AsyncMock()
    server.eio = SimpleNamespace(sockets={'eio-real': object(), 'eio-sim': object()})
    server.manager.sid_from_eio_sid = lambda sid, ns: {'eio-real': 'root-real', 'eio-sim': 'root-sim'}[sid]
    server.get_session.side_effect = lambda sid, **kw: {'trusted_identity': IdentityMetadata('real') if sid == 'root-real' else simulated_identity()}
    renew = AsyncMock()
    redis = AsyncMock()
    monkeypatch.setattr(connection, 'socket', server)
    monkeypatch.setattr(connection.RedisManager, 'client', lambda: redis)
    monkeypatch.setattr(connection, 'renew_presence', renew)

    async def finish(interval):
        raise asyncio.CancelledError

    monkeypatch.setattr(connection.asyncio, 'sleep', finish)
    with pytest.raises(asyncio.CancelledError):
        await connection.renew_session_keys_loop()
    renew.assert_awaited_once_with(redis, {'real': ['root-real']})
    server.disconnect.assert_not_awaited()


async def test_ordinary_real_redis_serialization_disconnect(redis, monkeypatch):
    server = IdentityAwareAsyncServer(async_mode='asgi')
    server.eio.sockets['ordinary'] = AsyncSocket(server.eio, 'ordinary')
    sid = await server.manager.connect('ordinary', '/')
    metadata = IdentityMetadata(str(uuid4()))
    monkeypatch.setattr(connection, 'socket', server)
    await sessions.register_socket(server, redis, sid, '/', metadata, int(time.time()) + 60)
    with identity_scope(metadata):
        await connection.connect(sid, redis)
        assert await redis.sismember('online_users', metadata.user_id)
        await connection.disconnect(sid, redis)
    await sessions.unregister_socket(server, redis, sid, '/')
    assert not await redis.sismember('online_users', metadata.user_id)
    assert not await redis.scard(f'sio:user:<{metadata.user_id}>:sockets')


async def test_stop_after_index_rejects_real_library_handshake(setup_service, monkeypatch):  # noqa: F811
    service, users, factory = setup_service
    record = await start(service, users)
    reader = ImpersonationSessionReaderImpl(factory)
    original_validation = reader.validate_identity
    server = socketio.AsyncServer(async_mode='asgi')
    server.eio.sockets['race'] = AsyncSocket(server.eio, 'race')
    server.environ['race'] = {}
    observed = []

    async def validate_after_stop(*args):
        assert await service.redis.scard(sessions.sockets_key(record.id)) == 1
        await service.end(record.id, EndReason.STOPPED)
        return await original_validation(*args)

    reader.validate_identity = validate_after_stop
    monkeypatch.setattr(sessions, 'get_service', lambda _: reader)

    async def connect(sid, environ, auth):
        observed.append(sid)
        await sessions.register_socket(server, service.redis, sid, '/',
            IdentityMetadata(str(users[2].id), str(users[0].id), str(record.id)),
            int(record.expires_at.replace(tzinfo=UTC).timestamp()))

    server.on('connect', connect)
    await server._handle_connect('race', '/', {})
    assert observed
    assert not server.manager.is_connected(observed[0], '/')
    assert not await service.redis.scard(sessions.sockets_key(record.id))
    assert ('/', observed[0]) not in sessions._timers


@pytest.mark.parametrize('timeout', [False, True])
async def test_local_expiry_precedes_bounded_remote_cleanup(monkeypatch, timeout):
    server = socketio.AsyncServer(async_mode='asgi')
    server.eio.sockets['deferred'] = AsyncSocket(server.eio, 'deferred')
    sid = await server.manager.connect('deferred', '/')
    entered, release = asyncio.Event(), asyncio.Event()

    async def blocked(*args):
        entered.set()
        await release.wait()

    monkeypatch.setattr(sessions, 'RedisSocketCloser', lambda: SimpleNamespace(close_session=blocked))
    monkeypatch.setattr(sessions, 'REMOTE_CLEANUP_TIMEOUT_SECONDS', 0.01 if timeout else 2)
    await sessions.register_socket(server, AsyncMock(), sid, '/', simulated_identity(), int(time.time()) + 1)
    timer = sessions._timers[('/', sid)]
    await asyncio.wait_for(entered.wait(), 2)
    assert not server.manager.is_connected(sid, '/')
    if not timeout:
        release.set()
    await asyncio.wait_for(asyncio.shield(timer), .2)


@pytest.mark.parametrize('failure', ['database', 'index'])
async def test_storage_failure_rejects_partial_handshake(reader, failure):
    server, redis = AsyncMock(), AsyncMock()
    if failure == 'database':
        reader.validate_identity.side_effect = ConnectionError('database unavailable')
    else:
        redis.sadd.side_effect = ConnectionError('index unavailable')
    with pytest.raises(ConnectionError):
        await sessions.register_socket(server, redis, 'sid', '/', simulated_identity(), int(time.time()) + 60)
    server.save_session.assert_not_awaited()
    assert ('/', 'sid') not in sessions._timers
