"""Notification service assembly for HTTP and cross-plugin callers."""

from uuid import UUID

from rapidkit_core.database import AsyncSessionLocal
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.admin.services import AdminNotificationService
from plugin_notification.recall import broadcast_recall


async def broadcast_admin_recall(message_id: UUID) -> None:
    async with AsyncSessionLocal() as session:
        await broadcast_recall(session, message_id)


def create_admin_service(session: AsyncSession | None = None) -> AdminNotificationService:
    # Preserve the standalone recall hook; HTTP historically relies on persisted inbox state.
    return AdminNotificationService(
        session=session,
        recall_broadcaster=broadcast_admin_recall if session is None else None,
    )
