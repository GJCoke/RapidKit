"""
投递 Worker（纯逻辑，供 Celery task 调用）。

抢占到期的 Outbox 行，调用渠道适配器，并把结果写回 Outbox 与用户收件箱。
"""

from datetime import timedelta
from typing import Any
from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from sqlmodel import col, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.channels import ChannelRegistry
from plugin_notification.enums import (
    BASE_BACKOFF_SECONDS,
    DELIVERY_BATCH_SIZE,
    MAX_ATTEMPTS,
    OUTBOX_LOCK_TTL_SECONDS,
    OutboxStatus,
)
from plugin_notification.models import NotificationMessage, NotificationOutbox, UserNotification

logger = get_plugin_logger("Notification")


class DeliveryWorker:
    """Claim and deliver one bounded batch of notification outbox rows."""

    def __init__(
        self,
        session: AsyncSession,
        redis: Any,
        registry: ChannelRegistry,
        worker_id: str,
        batch_size: int = DELIVERY_BATCH_SIZE,
    ) -> None:
        self.session = session
        self.redis = redis
        self.registry = registry
        self.worker_id = worker_id
        self.batch_size = batch_size

    async def _claim(self) -> list[NotificationOutbox]:
        now = timezone.now()
        statement = (
            select(NotificationOutbox)
            .where(
                col(NotificationOutbox.status).in_(
                    [OutboxStatus.PENDING.value, OutboxStatus.RETRYING.value]
                ),
                or_(
                    col(NotificationOutbox.next_attempt_at).is_(None),
                    col(NotificationOutbox.next_attempt_at) <= now,
                ),
                or_(
                    col(NotificationOutbox.locked_until).is_(None),
                    col(NotificationOutbox.locked_until) <= now,
                ),
            )
            .order_by(col(NotificationOutbox.id))
            .limit(self.batch_size)
            .with_for_update(skip_locked=True)
        )
        result = await self.session.exec(statement)
        rows = list(result.all())
        lock_until = now + timedelta(seconds=OUTBOX_LOCK_TTL_SECONDS)
        for row in rows:
            row.status = OutboxStatus.PROCESSING.value
            row.locked_by = self.worker_id
            row.locked_until = lock_until
            self.session.add(row)
        await self.session.flush()
        return rows

    async def _build_payload(self, message_id: UUID) -> dict[str, Any]:
        message = await self.session.get(NotificationMessage, message_id)
        if message is None:
            return {}
        return {
            "id": str(message.id),
            "contentMode": message.content_mode,
            "title": message.title,
            "content": message.content,
            "contentParams": message.content_params,
            "contentFormat": message.content_format,
            "level": message.level,
            "category": message.category,
            "mandatory": message.mandatory,
            "action": message.action,
            "createTime": timezone.f_datetime(message.create_time),
        }

    async def _mark_delivered_inbox(self, message_id: UUID, user_id: UUID) -> None:
        statement = select(UserNotification).where(
            col(UserNotification.message_id) == message_id,
            col(UserNotification.user_id) == user_id,
        )
        row = (await self.session.exec(statement)).first()
        if row is not None and row.delivered_at is None:
            row.delivered_at = timezone.now()
            self.session.add(row)

    @staticmethod
    def _clear_lock(row: NotificationOutbox) -> None:
        row.locked_by = None
        row.locked_until = None

    async def run_once(self) -> int:
        """Claim and process at most ``batch_size`` eligible rows."""
        rows = await self._claim()
        processed = 0
        for row in rows:
            adapter = self.registry.get(row.channel)
            if adapter is None:
                row.status = OutboxStatus.DEAD.value
                row.last_error_code = "unknown_channel"
                self._clear_lock(row)
                self.session.add(row)
                processed += 1
                continue

            payload = await self._build_payload(row.message_id)
            result = await adapter.deliver(
                redis=self.redis,
                user_id=row.user_id,
                payload=payload,
            )
            row.attempt_count += 1

            if result.success:
                row.status = OutboxStatus.SENT.value
                row.sent_at = timezone.now()
                row.last_error_code = None
                self._clear_lock(row)
                await self._mark_delivered_inbox(row.message_id, row.user_id)
            else:
                row.last_error_code = result.error_code
                self._clear_lock(row)
                if row.attempt_count >= MAX_ATTEMPTS:
                    row.status = OutboxStatus.DEAD.value
                else:
                    row.status = OutboxStatus.RETRYING.value
                    backoff = BASE_BACKOFF_SECONDS * (2 ** (row.attempt_count - 1))
                    row.next_attempt_at = timezone.now() + timedelta(seconds=backoff)
            self.session.add(row)
            processed += 1

        await self.session.flush()
        return processed
