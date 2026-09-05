"""Public notification service implementing the cross-plugin Notifier contract."""

from collections.abc import Callable

from rapidkit_common.protocols.notification import NotificationCommand, NotificationResult
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.services import get_service

from plugin_notification.audience import AudienceResolver
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference import PreferenceResolver

logger = get_plugin_logger("Notification")


def _default_enqueue_delivery() -> None:
    from plugin_notification.tasks import deliver_pending_notifications

    deliver_pending_notifications.apply_async()


class NotificationService:
    """Open the transaction boundary around notification orchestration."""

    def __init__(
        self,
        session_factory: Callable = AsyncSessionLocal,
        query_service: UserQueryService | None = None,
        enqueue_delivery: Callable[[], None] = _default_enqueue_delivery,
    ) -> None:
        self._session_factory = session_factory
        self._query_service = query_service
        self._enqueue_delivery = enqueue_delivery

    def _resolve_query_service(self) -> UserQueryService:
        if self._query_service is not None:
            return self._query_service
        return get_service(UserQueryService)

    async def send(self, command: NotificationCommand) -> NotificationResult:
        """Persist and commit a command before requesting asynchronous delivery."""
        query_service = self._resolve_query_service()
        async with self._session_factory() as session:
            orchestrator = MessageOrchestrator(
                session=session,
                audience_resolver=AudienceResolver(query_service=query_service),
                preference_resolver=PreferenceResolver(),
            )
            result = await orchestrator.process(command)
            await session.commit()

        if not result.deduplicated:
            try:
                self._enqueue_delivery()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to enqueue delivery, beat will retry: {}", exc)

        logger.info(
            "Notification sent: message_id={} recipients={} dedup={}",
            result.message_id,
            result.recipient_count,
            result.deduplicated,
        )
        return result
