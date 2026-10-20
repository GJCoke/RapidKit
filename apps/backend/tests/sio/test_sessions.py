import time
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from rapidkit_framework.identity import IdentityMetadata
from socketio.exceptions import ConnectionRefusedError

from src.sio import sessions


@pytest.fixture(autouse=True)
async def timers():
    yield
    await sessions.shutdown_socket_timers()


async def test_register_indexes_user_set_and_saves_identity():
    server, redis = AsyncMock(), AsyncMock()
    identity = IdentityMetadata(str(uuid4()), str(uuid4()))
    await sessions.register_socket(server, redis, 'sid', '/worker', identity, int(time.time()) + 60)
    redis.sadd.assert_awaited_once_with(f'sio:user:<{identity.user_id}>:sockets', '{"namespace":"/worker","sid":"sid"}')
    server.save_session.assert_awaited_once_with('sid', {'trusted_identity': identity}, namespace='/worker')


async def test_register_impersonated_indexes_both_sets_and_rejects_invalid():
    server, redis, reader = AsyncMock(), AsyncMock(), AsyncMock()
    identity = IdentityMetadata(str(uuid4()), str(uuid4()), str(uuid4()))
    reader.validate_identity.return_value = False
    with patch.object(sessions, 'get_service', return_value=reader), pytest.raises(ConnectionRefusedError) as exc:
        await sessions.register_socket(server, redis, 'sid', '/worker', identity, int(time.time()) + 60)
    assert exc.value.error_args['message'] == 'unauthorized'
    assert {c.args[0] for c in redis.srem.await_args_list} == {
        f'sio:user:<{identity.user_id}>:sockets', f'auth:impersonation:<{identity.impersonation_session_id}>:sockets'
    }
    server.save_session.assert_not_awaited()


async def test_expiry_emits_token_expired_then_disconnects():
    server, redis = AsyncMock(), AsyncMock()
    await sessions.register_socket(server, redis, 'sid', '/', IdentityMetadata(str(uuid4())), int(time.time()) + 1)
    await sessions._timers[('/', 'sid')]
    assert [c[0] for c in server.mock_calls if c[0] in ('emit', 'disconnect')] == ['emit', 'disconnect']
    server.emit.assert_awaited_once_with('auth:revoked', {'code': 'token_expired'}, to='sid', namespace='/')
    server.disconnect.assert_awaited_once_with('sid', namespace='/', ignore_queue=True)


async def test_close_user_filters_namespaces():
    server, redis = AsyncMock(), AsyncMock()
    redis.smembers.return_value = {'{"namespace":"/","sid":"root"}', '{"namespace":"/dashboard","sid":"dash"}'}
    await sessions.RedisSocketCloser(server).close_user(uuid4(), redis, namespaces={'/dashboard'}, reason='forbidden')
    server.emit.assert_awaited_once_with('auth:revoked', {'code': 'forbidden'}, to='dash', namespace='/dashboard')
    server.disconnect.assert_awaited_once_with('dash', namespace='/dashboard')
    assert redis.srem.await_count == 1


async def test_unregister_tolerates_redis_failure():
    server, redis = AsyncMock(), AsyncMock()
    server.get_session.return_value = {'trusted_identity': IdentityMetadata(str(uuid4()))}
    redis.srem.side_effect = ConnectionError
    await sessions.unregister_socket(server, redis, 'sid', '/')


async def test_registry_ttl_cannot_shrink():
    server, redis = AsyncMock(), AsyncMock()
    await sessions.register_socket(server, redis, 'sid', '/', IdentityMetadata(str(uuid4())), int(time.time()) + 60)
    assert redis.expire.await_args_list[0].kwargs == {'nx': True}
    assert redis.expire.await_args_list[1].kwargs == {'gt': True}
