"""Per-root-socket presence heartbeats shared across tabs and instances."""

import time

from src.sio.constants import SESSION_TTL, online_users_structure, presence_structure


async def mark_online(redis, user_id: str, sid: str) -> None:
    key = presence_structure.format(user_id=user_id)
    await redis.zadd(key, {sid: time.time()})
    await redis.expire(key, SESSION_TTL)
    await redis.sadd(online_users_structure, user_id)


async def mark_offline(redis, user_id: str, sid: str) -> None:
    await redis.zrem(presence_structure.format(user_id=user_id), sid)
    await prune_user(redis, user_id)


async def prune_user(redis, user_id: str) -> bool:
    key = presence_structure.format(user_id=user_id)
    await redis.zremrangebyscore(key, '-inf', time.time() - SESSION_TTL)
    if await redis.zcard(key):
        return True
    await redis.srem(online_users_structure, user_id)
    return False


async def renew_presence(redis, entries: dict[str, list[str]]) -> None:
    now = time.time()
    async with redis.pipeline(transaction=False) as pipeline:
        for user_id, sids in entries.items():
            key = presence_structure.format(user_id=user_id)
            pipeline.zadd(key, dict.fromkeys(sids, now))
            pipeline.expire(key, SESSION_TTL)
            pipeline.sadd(online_users_structure, user_id)
        await pipeline.execute()
