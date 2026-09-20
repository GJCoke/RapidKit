"""Administrative notification lifecycle service."""

from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any
from uuid import UUID

from rapidkit_common.protocols.notification import (
    AudiencePreview,
    AudienceRule,
    NotificationCommand,
    NotificationResult,
)
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from sqlmodel import col

from plugin_notification.audience import AudienceResolver
from plugin_notification.audit import audit
from plugin_notification.crud import AudienceCRUD, MessageCRUD
from plugin_notification.enums import MessageStatus
from plugin_notification.models import NotificationAudience, NotificationMessage
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference import PreferenceResolver
from plugin_notification.status_codes import NotificationStatusCode

logger = get_plugin_logger("Notification")

SessionFactory = Callable[[], Any]
EnqueueDelivery = Callable[[], None]
RecallBroadcaster = Callable[[UUID], Awaitable[Any]]


def _default_enqueue_delivery() -> None:
    """Request delivery after commit without importing Celery during plugin import."""
    from plugin_notification.tasks import deliver_pending_notifications

    deliver_pending_notifications.apply_async()


def _audience_type_summary(audience: list[AudienceRule]) -> str:
    return ",".join(dict.fromkeys(rule.type for rule in audience))


class AdminNotificationService:
    """Own transaction boundaries for administrative notification operations."""

    def __init__(
        self,
        session_factory: SessionFactory = AsyncSessionLocal,
        query_service: UserQueryService | None = None,
        enqueue_delivery: EnqueueDelivery = _default_enqueue_delivery,
        recall_broadcaster: RecallBroadcaster | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._query_service = query_service
        self._enqueue_delivery = enqueue_delivery
        self._recall_broadcaster = recall_broadcaster

    def _resolve_query_service(self) -> UserQueryService:
        if self._query_service is not None:
            return self._query_service
        return get_service(UserQueryService)

    def _orchestrator(self, session: Any) -> MessageOrchestrator:
        return MessageOrchestrator(
            session=session,
            audience_resolver=AudienceResolver(
                query_service=self._resolve_query_service(),
            ),
            preference_resolver=PreferenceResolver(session=session),
        )

    def enqueue_delivery(self) -> None:
        """Request delivery now while preserving beat as the durable fallback."""
        try:
            self._enqueue_delivery()
        except Exception as exc:  # noqa: BLE001 - periodic delivery remains available
            logger.warning("Failed to enqueue delivery, beat will retry: {}", exc)

    async def create_message(
        self,
        command: NotificationCommand,
        *,
        created_by: UUID,
        publish_at: datetime | None = None,
        expire_at: datetime | None = None,
    ) -> NotificationResult:
        """Persist a draft or scheduled message, then audit the committed result."""
        async with self._session_factory() as session:
            message = await self._orchestrator(session).create_message(
                command,
                created_by=created_by,
                publish_at=publish_at,
                expire_at=expire_at,
            )
            message_id = message.id
            correlation_id = message.correlation_id
            await session.commit()

        audit(
            "create",
            operator_id=created_by,
            target_id=message_id,
            correlation_id=correlation_id,
            audience_summary=_audience_type_summary(command.audience),
        )
        return NotificationResult(
            message_id=message_id,
            recipient_count=0,
            deduplicated=False,
        )

    async def get_message(self, message_id: UUID) -> tuple[NotificationMessage, list[NotificationAudience]]:
        async with self._session_factory() as session:
            message = await MessageCRUD(session).get(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            audiences = await AudienceCRUD(session).get_all(
                col(NotificationAudience.message_id) == message_id
            )
            return message, audiences

    async def update_message(
        self,
        message_id: UUID,
        command: NotificationCommand,
        *,
        operator_id: UUID,
        publish_at: datetime | None,
        expire_at: datetime | None,
    ) -> NotificationMessage:
        async with self._session_factory() as session:
            message = await self._orchestrator(session).update_message(
                message_id,
                command,
                publish_at=publish_at,
                expire_at=expire_at,
            )
            correlation_id = message.correlation_id
            await session.commit()
        audit("update", operator_id=operator_id, target_id=message_id, correlation_id=correlation_id)
        return message

    async def delete_message(self, message_id: UUID, *, operator_id: UUID) -> None:
        async with self._session_factory() as session:
            message = await MessageCRUD(session).get(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            correlation_id = message.correlation_id
            await self._orchestrator(session).delete_message(message_id)
            await session.commit()
        audit("delete", operator_id=operator_id, target_id=message_id, correlation_id=correlation_id)

    async def publish(
        self,
        message_id: UUID,
        *,
        operator_id: UUID,
    ) -> NotificationResult:
        """Publish and commit before requesting asynchronous delivery."""
        async with self._session_factory() as session:
            recipient_count = await self._orchestrator(session).publish_message(message_id)
            message = await MessageCRUD(session).get(message_id, nullable=False)
            correlation_id = message.correlation_id
            await session.commit()

        self.enqueue_delivery()

        audit(
            "publish",
            operator_id=operator_id,
            target_id=message_id,
            correlation_id=correlation_id,
        )
        return NotificationResult(
            message_id=message_id,
            recipient_count=recipient_count,
            deduplicated=False,
        )

    async def cancel(self, message_id: UUID, *, operator_id: UUID) -> None:
        """Cancel and commit before recording the audit event."""
        async with self._session_factory() as session:
            await self._orchestrator(session).cancel_message(message_id)
            message = await MessageCRUD(session).get(message_id, nullable=False)
            correlation_id = message.correlation_id
            await session.commit()

        audit(
            "cancel",
            operator_id=operator_id,
            target_id=message_id,
            correlation_id=correlation_id,
        )

    async def recall(self, message_id: UUID, *, operator_id: UUID) -> None:
        """Recall and commit before broadcasting, isolating broadcast failures."""
        async with self._session_factory() as session:
            await self._orchestrator(session).recall_message(message_id)
            message = await MessageCRUD(session).get(message_id, nullable=False)
            correlation_id = message.correlation_id
            await session.commit()

        if self._recall_broadcaster is not None:
            try:
                await self._recall_broadcaster(message_id)
            except Exception as exc:  # noqa: BLE001 - database remains the source of truth
                logger.warning(
                    "Recall broadcast failed for message_id={}: {}",
                    message_id,
                    exc,
                )

        audit(
            "recall",
            operator_id=operator_id,
            target_id=message_id,
            correlation_id=correlation_id,
        )

    async def preview_audience(
        self,
        audience: list[AudienceRule],
        *,
        message_id: UUID | None = None,
    ) -> AudiencePreview:
        """Estimate unique recipients overall and independently per rule type."""
        async with self._session_factory() as session:
            if message_id is not None:
                message = await MessageCRUD(session).get(message_id)
                if message is None:
                    raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
                if message.status not in {MessageStatus.DRAFT.value, MessageStatus.SCHEDULED.value}:
                    raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            resolver = AudienceResolver(
                query_service=self._resolve_query_service(),
            )
            all_user_ids: set[UUID] = set()
            user_ids_by_type: dict[str, set[UUID]] = {}
            for rule in audience:
                resolved = await resolver.resolve([rule])
                all_user_ids.update(resolved)
                user_ids_by_type.setdefault(rule.type, set()).update(resolved)

        return AudiencePreview(
            total=len(all_user_ids),
            by_type={audience_type: len(user_ids) for audience_type, user_ids in user_ids_by_type.items()},
        )
