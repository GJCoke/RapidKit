"""消息编排：解析受众并在同一事务中创建通知投递记录。"""

from uuid import uuid4

from rapidkit_common.protocols.notification import NotificationCommand, NotificationResult
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlmodel import col
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.audience import AudienceResolver
from plugin_notification.crud import AudienceCRUD, MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.models import UserNotification
from plugin_notification.preference import PreferenceResolver
from plugin_notification.status_codes import NotificationStatusCode

logger = get_plugin_logger("Notification")

_ALLOWED_CHANNELS = {"in_app"}


class MessageOrchestrator:
    """Persist one normalized notification command and its fan-out records."""

    def __init__(
        self,
        session: AsyncSession,
        audience_resolver: AudienceResolver,
        preference_resolver: PreferenceResolver,
    ) -> None:
        self.session = session
        self.audience = audience_resolver
        self.preference = preference_resolver

    async def process(self, command: NotificationCommand) -> NotificationResult:
        """Resolve, deduplicate, and persist a notification without committing."""
        for channel in command.channels:
            if channel not in _ALLOWED_CHANNELS:
                logger.warning("Invalid channel in command: {}", channel)
                raise AppException(NotificationStatusCode.INVALID_CHANNEL)

        message_crud = MessageCRUD(self.session)
        if command.deduplication_key is not None:
            existing = await message_crud.get_by_source_dedup(command.source, command.deduplication_key)
            if existing is not None:
                recipients = await UserNotificationCRUD(self.session).get_all(
                    col(UserNotification.message_id) == existing.id
                )
                return NotificationResult(
                    message_id=existing.id,
                    recipient_count=len(recipients),
                    deduplicated=True,
                )

        user_ids = await self.audience.resolve(command.audience)
        user_ids = await self.preference.filter_allowed(
            user_ids,
            category=command.category,
            mandatory=command.mandatory,
        )
        if not user_ids:
            logger.warning(
                "Empty audience for source={} category={}",
                command.source,
                command.category,
            )
            raise AppException(NotificationStatusCode.EMPTY_AUDIENCE)

        if command.content_mode == "i18n":
            title = command.i18n_key or ""
            content = command.i18n_key or ""
            content_params = command.i18n_params
            content_format = None
        else:
            title = command.raw_title or ""
            content = command.raw_content or ""
            content_params = None
            content_format = command.raw_format

        try:
            message = await message_crud.create(
                {
                    "source": command.source,
                    "category": command.category,
                    "level": command.level,
                    "content_mode": command.content_mode,
                    "title": title,
                    "content": content,
                    "content_params": content_params,
                    "content_format": content_format,
                    "mandatory": command.mandatory,
                    "channels": list(command.channels),
                    "action": command.action.model_dump() if command.action is not None else None,
                    "meta": command.meta,
                    "status": MessageStatus.PUBLISHING.value,
                    "deduplication_key": command.deduplication_key,
                    "correlation_id": uuid4().hex,
                    "created_by": None,
                }
            )
        except AppException as exc:
            if command.deduplication_key is None or exc.code != StatusCode.ALREADY_EXISTS.code:
                raise
            existing = await message_crud.get_by_source_dedup(command.source, command.deduplication_key)
            if existing is None:
                raise
            recipients = await UserNotificationCRUD(self.session).get_all(
                col(UserNotification.message_id) == existing.id
            )
            return NotificationResult(
                message_id=existing.id,
                recipient_count=len(recipients),
                deduplicated=True,
            )

        await AudienceCRUD(self.session).create_all(
            [
                {
                    "message_id": message.id,
                    "audience_type": rule.type,
                    "audience_value": rule.value,
                    "include_descendants": rule.include_descendants,
                }
                for rule in command.audience
            ]
        )
        await UserNotificationCRUD(self.session).create_all(
            [{"message_id": message.id, "user_id": user_id} for user_id in user_ids]
        )
        await OutboxCRUD(self.session).create_all(
            [
                {
                    "message_id": message.id,
                    "user_id": user_id,
                    "channel": channel,
                    "status": OutboxStatus.PENDING.value,
                    "idempotency_key": f"{message.id}:{user_id}:{channel}",
                    "attempt_count": 0,
                    "next_attempt_at": timezone.now(),
                }
                for user_id in user_ids
                for channel in command.channels
            ]
        )

        await message_crud.update_by_id(message.id, {"status": MessageStatus.PUBLISHED.value})

        return NotificationResult(
            message_id=message.id,
            recipient_count=len(user_ids),
            deduplicated=False,
        )
