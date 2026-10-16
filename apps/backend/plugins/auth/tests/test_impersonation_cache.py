import json
from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_auth.impersonation.cache import active_key, actor_key, cache_active, clear_active, sockets_key, subject_key
from plugin_auth.impersonation.models import ImpersonationSession
from rapidkit_core.timezone import timezone


@pytest.mark.asyncio
async def test_ttl_indexes_recovery_and_socket_preservation(redis):
    record = ImpersonationSession(
        actor_id=uuid4(), subject_user_id=uuid4(), expires_at=timezone.now() + timedelta(seconds=30)
    )
    assert await cache_active(redis, record)
    assert 28 <= await redis.ttl(active_key(record.id)) <= 30
    payload = json.loads(await redis.get(active_key(record.id)))
    assert payload["actor_id"] == str(record.actor_id)
    assert payload["subject_user_id"] == str(record.subject_user_id)
    assert await redis.smembers(actor_key(record.actor_id)) == {str(record.id)}
    assert await redis.smembers(subject_key(record.subject_user_id)) == {str(record.id)}
    await redis.delete(active_key(record.id))
    assert await cache_active(redis, record)
    await redis.sadd(sockets_key(record.id), "socket")
    await clear_active(redis, record)
    assert await redis.get(active_key(record.id)) is None
    assert not await redis.smembers(actor_key(record.actor_id))
    assert not await redis.smembers(subject_key(record.subject_user_id))
    assert await redis.smembers(sockets_key(record.id)) == {"socket"}


@pytest.mark.asyncio
@pytest.mark.parametrize("ended", [False, True])
async def test_expired_or_ended_not_repopulated(ended):
    redis = AsyncMock()
    record = ImpersonationSession(
        actor_id=uuid4(),
        subject_user_id=uuid4(),
        expires_at=timezone.now() + timedelta(seconds=30 if ended else -1),
        ended_at=timezone.now() if ended else None,
    )
    assert not await cache_active(redis, record)
    redis.set.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["set", "sadd"])
async def test_cache_errors_propagate(operation):
    redis = AsyncMock()
    getattr(redis, operation).side_effect = RuntimeError("redis failed")
    record = ImpersonationSession(
        actor_id=uuid4(), subject_user_id=uuid4(), expires_at=timezone.now() + timedelta(seconds=30)
    )
    with pytest.raises(RuntimeError):
        await cache_active(redis, record)
