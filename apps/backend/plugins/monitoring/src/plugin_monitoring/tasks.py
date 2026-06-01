"""
API 指标聚合 Celery 定时任务。

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_core.distributed_lock import DistributedLock
from rapidkit_core.log import logger
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession

from plugin_monitoring.aggregator import aggregate_once, cleanup_old_metrics


@app.task(name="aggregate_api_metrics")
async def aggregate_api_metrics(redis: TaskRedis, session: TaskSession) -> None:
    """单次执行 API 指标聚合（由 Celery Beat 每 60 秒调用）。"""
    lock = DistributedLock(redis, "lock:aggregate_api_metrics", ttl=120)
    if not await lock.acquire():
        logger.debug("aggregate_api_metrics skipped — another instance is running.")
        return
    try:
        await aggregate_once(redis, session)
    finally:
        await lock.release()


@app.task(name="cleanup_old_api_metrics")
async def cleanup_old_api_metrics(redis: TaskRedis, session: TaskSession) -> None:
    """清理过期 API 指标归档数据（由 Celery Beat 每天凌晨调用）。"""
    lock = DistributedLock(redis, "lock:cleanup_old_api_metrics", ttl=300)
    if not await lock.acquire():
        logger.debug("cleanup_old_api_metrics skipped — another instance is running.")
        return
    try:
        await cleanup_old_metrics(session)
    finally:
        await lock.release()
