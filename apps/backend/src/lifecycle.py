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
from rapidkit_core.leader_election import LeaderElection
from rapidkit_core.log import logger

from src.locales.watch import watch_locale_files
from src.queues.consumer import check_worker_offline, consume_events
from src.sio.events.connection import renew_session_keys_loop


async def _flush_audit_batch(batch: list[dict]) -> None:
    """批量写入审计日志到数据库。"""
    from plugin_system.crud import ActivityLogCRUD
    from rapidkit_core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        crud = ActivityLogCRUD(session)
        await crud.create_all(batch)
        await session.commit()


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

    # 初始化审计批量队列
    from rapidkit_core.batch_queue import AsyncBatchQueue

    from src.middlewares import audit as audit_module

    if settings.AUDIT_ENABLED:
        audit_module.audit_queue = AsyncBatchQueue(
            handler=_flush_audit_batch,
            batch_size=settings.AUDIT_BATCH_SIZE,
            flush_interval=settings.AUDIT_FLUSH_INTERVAL,
        )
        await audit_module.audit_queue.start()
        logger.info(
            "Audit batch queue started (batch_size={}, interval={}s)",
            settings.AUDIT_BATCH_SIZE,
            settings.AUDIT_FLUSH_INTERVAL,
        )

    consumer_task = None
    offline_checker_task = None
    worker_leader: LeaderElection | None = None
    if settings.ENABLE_CELERY_MONITOR:
        RedisManager.connect(redis_url=str(settings.CELERY_REDIS_URL), pool_name="celery")
        redis = RedisManager.client()
        worker_leader = LeaderElection(redis, "leader:worker_offline_checker")
        await worker_leader.start()
        socket = app.state.socket
        consumer_task = asyncio.create_task(consume_events(socket))
        offline_checker_task = asyncio.create_task(check_worker_offline(socket, worker_leader))
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

    # Socket.IO session key renewal (per-instance, renews TTL for active connections)
    renew_task = asyncio.create_task(renew_session_keys_loop())

    logger.info("Application startup complete.")

    yield

    # 关闭审计批量队列（flush 剩余记录）
    if audit_module.audit_queue is not None:
        await audit_module.audit_queue.shutdown()
        logger.info("Audit batch queue shut down.")

    # 执行插件 on_shutdown 回调（逆序）
    for plugin in reversed(getattr(app.state, "plugins", [])):
        for cb in plugin.on_shutdown:
            await cb(app)

    renew_task.cancel()

    if consumer_task:
        consumer_task.cancel()
    if offline_checker_task:
        offline_checker_task.cancel()
    if worker_leader:
        await worker_leader.stop()
    if watch_task:
        watch_task.cancel()

    await event_bus.shutdown()
    await RedisManager.clear()
    await async_engine.dispose()
    sync_engine.dispose()

    logger.info("Application shutdown complete.")
