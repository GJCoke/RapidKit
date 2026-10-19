"""
内置功能包启动同步。

Author : Coke
Date   : 2026-10-17
"""

import asyncio
from typing import TYPE_CHECKING

from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.distributed_lock import DistributedLock
from rapidkit_core.log import get_plugin_logger

from plugin_permission.package.services import sync_builtin_packages

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = get_plugin_logger("Permission")


async def sync_builtin_packages_on_startup(app: FastAPI) -> None:
    """插件 on_startup 回调：在目录构建之后同步内置功能包。"""
    manifests = getattr(app.state, "plugins", [])
    redis = RedisManager.client()
    for attempt in range(3):
        lock = DistributedLock(redis, "lock:permission_package_sync", ttl=30)
        if await lock.acquire():
            try:
                async with AsyncSessionLocal() as session:
                    await sync_builtin_packages(session, manifests)
                    await session.commit()
            finally:
                await lock.release()
            return
        logger.debug("Permission package sync lock busy, retrying ({}/3)...", attempt + 1)
        await asyncio.sleep(2)
    logger.warning("Permission package sync failed after 3 attempts — lock not acquired.")
