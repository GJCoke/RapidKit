"""
FastAPI lifecycle.

Author : Coke
Date   : 2025-03-17
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from rapidkit_core.config import settings
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger

from src.locales.watch import watch_locale_files
from src.queues.consumer import check_worker_offline, consume_events


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    FastAPI 生命周期管理。

    Args:
        app: FastAPI 应用实例。
    """

    watch_task = None
    if settings.ENVIRONMENT.is_dev:
        watch_task = asyncio.create_task(watch_locale_files())

    RedisManager.connect()

    consumer_task = None
    offline_checker_task = None
    if settings.ENABLE_CELERY_MONITOR:
        RedisManager.connect(redis_url=str(settings.CELERY_REDIS_URL), pool_name="celery")
        socket = app.state.socket
        consumer_task = asyncio.create_task(consume_events(socket))
        offline_checker_task = asyncio.create_task(check_worker_offline(socket))
        logger.info("Celery monitor enabled.")

    # 执行插件 on_startup 回调
    for plugin in getattr(app.state, "plugins", []):
        for cb in plugin.on_startup:
            await cb(app)

    logger.info("Application startup complete.")

    yield

    # 执行插件 on_shutdown 回调（逆序）
    for plugin in reversed(getattr(app.state, "plugins", [])):
        for cb in plugin.on_shutdown:
            await cb(app)

    if consumer_task:
        consumer_task.cancel()
    if offline_checker_task:
        offline_checker_task.cancel()
    if watch_task:
        watch_task.cancel()

    await RedisManager.clear()

    logger.info("Application shutdown complete.")
