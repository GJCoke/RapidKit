"""通知投递 Celery 任务（由 register().task_modules 自动发现）。"""

import socket as _socket

from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.distributed_lock import DistributedLock
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.services import get_service
from sqlmodel.ext.asyncio.session import AsyncSession
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession

from plugin_notification.audience import AudienceResolver
from plugin_notification.crud import MessageCRUD, OutboxCRUD
from plugin_notification.enums import MessageStatus
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference import PreferenceResolver

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


def _build_orchestrator(session: AsyncSession) -> MessageOrchestrator:
    """Build the publication orchestrator from registered runtime services."""
    return MessageOrchestrator(
        session=session,
        audience_resolver=AudienceResolver(
            query_service=get_service(UserQueryService),
        ),
        preference_resolver=PreferenceResolver(session=session),
    )


async def _publish_due(
    session: AsyncSession,
    orchestrator: MessageOrchestrator,
) -> int:
    """Publish due messages independently so one failure cannot poison the batch."""
    due_messages = await MessageCRUD(session).get_due_scheduled(timezone.now())
    message_ids = [message.id for message in due_messages]
    published = 0
    for message_id in message_ids:
        try:
            async with session.begin_nested():
                await orchestrator.publish_message(message_id, scheduled_run=True)
        except Exception as exc:  # noqa: BLE001 - one failed message must not stop the batch
            logger.warning(
                "Scheduled publish failed for message_id={}: {}",
                message_id,
                exc,
            )
        else:
            published += 1
    return published


async def _expire_due(session: AsyncSession) -> int:
    """Expire due published messages after locking and revalidating each row."""
    now = timezone.now()
    crud = MessageCRUD(session)
    candidates = await crud.get_expired_published(now)
    expired = 0
    for candidate in candidates:
        async with session.begin_nested():
            message = await crud.get_for_update(candidate.id)
            if (
                message is None
                or message.status != MessageStatus.PUBLISHED.value
                or message.expire_at is None
                or message.expire_at > now
            ):
                continue
            await crud.update_by_id(
                message.id,
                {"status": MessageStatus.EXPIRED.value},
            )
            await OutboxCRUD(session).cancel_pending(message.id)
            expired += 1
    return expired


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


@app.task(name="publish_scheduled_notifications")
async def publish_scheduled_notifications(
    redis: TaskRedis,
    session: TaskSession,
) -> None:
    """Publish due scheduled notifications under a cluster-wide lock."""
    lock = DistributedLock(redis, "lock:publish_scheduled_notifications", ttl=60)
    if not await lock.acquire():
        return
    try:
        async with session() as database_session:
            orchestrator = _build_orchestrator(database_session)
            count = await _publish_due(database_session, orchestrator)
            await database_session.commit()
        if count:
            logger.info("Published {} scheduled notifications", count)
            deliver_pending_notifications.apply_async()
    finally:
        await lock.release()


@app.task(name="expire_notifications")
async def expire_notifications(redis: TaskRedis, session: TaskSession) -> None:
    """Expire published notifications under a cluster-wide lock."""
    lock = DistributedLock(redis, "lock:expire_notifications", ttl=60)
    if not await lock.acquire():
        return
    try:
        async with session() as database_session:
            count = await _expire_due(database_session)
            await database_session.commit()
        if count:
            logger.info("Expired {} notifications", count)
    finally:
        await lock.release()
