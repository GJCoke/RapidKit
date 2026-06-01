"""
Socket.IO session Redis key cleanup task.

Author : Coke
Date   : 2026-04-23
"""

from rapidkit_core.distributed_lock import DistributedLock
from rapidkit_core.log import logger

from src.queues.app import app
from src.queues.deps import TaskRedis
from src.sio.constants import online_users_structure, user_sid_structure


@app.task(name="cleanup_stale_online_users")
async def cleanup_stale_online_users(redis: TaskRedis) -> None:
    """清理 online_users 集合中过期的 user_id（由 Celery Beat 每 120 秒调用）。"""
    lock = DistributedLock(redis, "lock:cleanup_stale_online_users", ttl=60)
    if not await lock.acquire():
        logger.debug("cleanup_stale_online_users skipped — another instance is running.")
        return
    try:
        members = await redis.smembers(online_users_structure)
        removed = 0
        for user_id in members:
            exists = await redis.exists(user_sid_structure.format(user_id=user_id))
            if not exists:
                await redis.srem(online_users_structure, user_id)
                removed += 1
        if removed:
            logger.info("Cleaned {} stale online users", removed)
    finally:
        await lock.release()
