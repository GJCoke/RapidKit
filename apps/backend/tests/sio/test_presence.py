import time
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi_sio_di import AsyncServer
from rapidkit_framework.identity import IdentityMetadata, identity_scope

from src.sio import presence

with patch.object(AsyncServer, 'instrument'):
    from src.sio.events import connection


async def test_two_tabs_stay_online_until_last_closes(redis):
    user = str(uuid4())
    await presence.mark_online(redis, user, 'one')
    await presence.mark_online(redis, user, 'two')
    await presence.mark_offline(redis, user, 'one')
    assert await redis.sismember('online_users', user)
    await presence.mark_offline(redis, user, 'two')
    assert not await redis.sismember('online_users', user)


async def test_prune_removes_crashed_sid(redis):
    user = str(uuid4())
    await redis.zadd(f'presence:user:<{user}>', {'crashed': time.time() - 121})
    await redis.sadd('online_users', user)
    assert await presence.prune_user(redis, user) is False
    assert not await redis.sismember('online_users', user)


async def test_renew_refreshes_scores(redis):
    user = str(uuid4())
    await redis.zadd(f'presence:user:<{user}>', {'sid': 1})
    await presence.renew_presence(redis, {user: ['sid']})
    assert await redis.zscore(f'presence:user:<{user}>', 'sid') > 1
    await presence.mark_offline(redis, user, 'sid')


async def test_disconnect_tolerates_redis_failure(monkeypatch):
    redis, server = AsyncMock(), AsyncMock()
    redis.zrem.side_effect = ConnectionError('offline')
    monkeypatch.setattr(connection, 'socket', server)
    with identity_scope(IdentityMetadata('user')):
        await connection.disconnect('sid', redis)
    server.disconnect.assert_not_awaited()


async def test_root_disconnect_does_not_touch_other_namespaces(monkeypatch):
    server = AsyncMock()
    monkeypatch.setattr(connection, 'socket', server)
    with identity_scope(IdentityMetadata('user')):
        await connection.disconnect('sid', AsyncMock())
    server.disconnect.assert_not_awaited()
