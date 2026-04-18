"""
FastAPI lifecycle.

Author : Coke
Date   : 2025-03-17
"""

import asyncio
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from rapidkit_core.config import settings
from rapidkit_core.database import RedisManager, async_engine, sync_engine
from rapidkit_core.events import event_bus
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
    await event_bus.start_subscriber()

    consumer_task = None
    offline_checker_task = None
    if settings.ENABLE_CELERY_MONITOR:
        RedisManager.connect(redis_url=str(settings.CELERY_REDIS_URL), pool_name="celery")
        socket = app.state.socket
        consumer_task = asyncio.create_task(consume_events(socket))
        offline_checker_task = asyncio.create_task(check_worker_offline(socket))
        logger.info("Celery monitor enabled.")

    # 执行插件 on_startup 回调（追踪耗时）
    plugin_meta = getattr(app.state, "plugin_meta", {})
    for plugin in getattr(app.state, "plugins", []):
        t0 = time.perf_counter()
        for cb in plugin.on_startup:
            await cb(app)
        startup_ms = (time.perf_counter() - t0) * 1000
        if plugin.name in plugin_meta:
            plugin_meta[plugin.name].startup_ms = round(startup_ms, 2)

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

    await event_bus.shutdown()
    await RedisManager.clear()
    await async_engine.dispose()
    sync_engine.dispose()

    logger.info("Application shutdown complete.")
