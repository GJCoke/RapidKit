"""Broadcast recalled notifications to each recipient's stable Socket.IO room."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.channels import notification_user_room
from plugin_notification.emitter import get_external_sio
from plugin_notification.models import UserNotification

logger = get_plugin_logger("Notification")

_NOTIFICATION_NAMESPACE = "/notifications"


async def broadcast_recall(
    session: AsyncSession,
    message_id: UUID,
    *,
    sio_factory: Callable[[], Any] = get_external_sio,
) -> int:
    """Emit one recall event per distinct recipient, isolating recipient failures."""
    result = await session.exec(select(UserNotification.user_id).where(col(UserNotification.message_id) == message_id))
    user_ids = list(dict.fromkeys(result.all()))
    sio = sio_factory()
    sent = 0

    for user_id in user_ids:
        try:
            await sio.emit(
                "notification:recalled",
                {"messageId": str(message_id)},
                room=notification_user_room(user_id),
                namespace=_NOTIFICATION_NAMESPACE,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Recall emit failed for user_id={}: {}", user_id, exc)
            continue
        sent += 1

    return sent
