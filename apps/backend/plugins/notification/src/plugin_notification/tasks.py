"""通知投递 Celery 任务（由 register().task_modules 自动发现）。"""

import socket as _socket

from rapidkit_core.distributed_lock import DistributedLock
from rapidkit_core.log import get_plugin_logger
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession

logger = get_plugin_logger("Notification")


async def _drain(session_factory: TaskSession, redis: TaskRedis) -> int:
    from plugin_notification.channels import ChannelRegistry, InAppChannel
    from plugin_notification.worker import DeliveryWorker

    registry = ChannelRegistry()
    registry.register("in_app", InAppChannel())
    worker_id = _socket.gethostname()
    total = 0
    async with session_factory() as session:
        worker = DeliveryWorker(
            session=session,
            redis=redis,
            registry=registry,
            worker_id=worker_id,
        )
        for _ in range(10):
            processed = await worker.run_once()
            await session.commit()
            total += processed
            if processed == 0:
                break
    return total


@app.task(name="deliver_pending_notifications")
async def deliver_pending_notifications(redis: TaskRedis, session: TaskSession) -> None:
    """批量投递到期的 Outbox 任务。"""
    total = await _drain(session, redis)
    if total:
        logger.info("Delivered {} notification outbox rows", total)


@app.task(name="cleanup_notification_outbox")
async def cleanup_notification_outbox(redis: TaskRedis, session: TaskSession) -> None:
    """定期兜底推进到期的 Outbox 任务。"""
    lock = DistributedLock(redis, "lock:cleanup_notification_outbox", ttl=60)
    if not await lock.acquire():
        return
    try:
        total = await _drain(session, redis)
        if total:
            logger.info("Cleanup delivered {} notification outbox rows", total)
    finally:
        await lock.release()
