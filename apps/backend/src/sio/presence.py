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
    # Keep the empty check and index removal atomic with concurrent joins and heartbeats.
    return bool(
        await redis.eval(
            """
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        if redis.call('ZCARD', KEYS[1]) == 0 then
            redis.call('SREM', KEYS[2], ARGV[2])
            return 0
        end
        return 1
        """,
            2,
            presence_structure.format(user_id=user_id),
            online_users_structure,
            time.time() - SESSION_TTL,
            user_id,
        )
    )


async def renew_presence(redis, entries: dict[str, list[str]]) -> None:
    now = time.time()
    async with redis.pipeline(transaction=False) as pipeline:
        for user_id, sids in entries.items():
            key = presence_structure.format(user_id=user_id)
            pipeline.zadd(key, dict.fromkeys(sids, now))
            pipeline.expire(key, SESSION_TTL)
            pipeline.sadd(online_users_structure, user_id)
        await pipeline.execute()
