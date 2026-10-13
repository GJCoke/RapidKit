"""消息编排：解析受众并在同一事务中创建通知投递记录。"""

from datetime import datetime
from uuid import UUID, uuid4

from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand, NotificationResult
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlmodel import col, delete
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.actions import resolve_action
from plugin_notification.audience import AudienceResolver
from plugin_notification.content import resolve_content
from plugin_notification.crud import AudienceCRUD, MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.models import NotificationAudience, NotificationMessage, UserNotification
from plugin_notification.personalization import content_snapshot, render_personalized
from plugin_notification.preference import PreferenceResolver
from plugin_notification.renderer import RenderedContent
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import (
    validate_json_shape,
)

logger = get_plugin_logger("Notification")

_ALLOWED_CHANNELS = {"in_app"}


class MessageOrchestrator:
    """Persist one normalized notification command and its fan-out records."""

    def __init__(
        self,
        session: AsyncSession,
        audience_resolver: AudienceResolver,
        preference_resolver: PreferenceResolver,
        menu_provider: MenuNavigationProvider | None = None,
    ) -> None:
        self.session = session
        self.audience = audience_resolver
        self.preference = preference_resolver
        self.menu_provider = menu_provider

    async def _resolve_content(self, command: NotificationCommand) -> tuple[RenderedContent, UUID | None, dict | None]:
        return await resolve_content(self.session, command)

    async def _fanout(
        self,
        message: NotificationMessage,
        audience_rules: list[AudienceRule],
        *,
        allow_empty: bool = False,
    ) -> int:
        """Fan an existing message out to inbox and outbox records."""
        user_ids = await self.audience.resolve(audience_rules)
        user_ids = await self.preference.filter_allowed(
            user_ids,
            category=message.category,
            mandatory=message.mandatory,
        )
        if not user_ids:
            logger.warning("Empty audience for message_id={}", message.id)
            if not allow_empty:
                raise AppException(NotificationStatusCode.EMPTY_AUDIENCE)
            await MessageCRUD(self.session).update_by_id(
                message.id,
                {
                    "status": MessageStatus.PUBLISHED.value,
                    "published_at": timezone.now(),
                },
            )
            return 0

        snapshots = {}
        if message.personalization is not None:
            profiles = await self.audience.get_public_profiles(user_ids)
            # Render every recipient before writing any inbox or outbox row.
            snapshots = {
                user_id: content_snapshot(render_personalized(message.personalization, profiles.get(user_id)))
                for user_id in user_ids
            }
        await UserNotificationCRUD(self.session).create_all(
            [
                {"message_id": message.id, "user_id": user_id, "rendered_content": snapshots.get(user_id)}
                for user_id in user_ids
            ]
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
                for channel in (message.channels or ["in_app"])
            ]
        )
        await MessageCRUD(self.session).update_by_id(
            message.id,
            {
                "status": MessageStatus.PUBLISHED.value,
                "published_at": timezone.now(),
            },
        )
        return len(user_ids)

    async def _load_audience_rules(self, message_id: UUID) -> list[AudienceRule]:
        """Rebuild publication input exclusively from the persisted audience snapshot."""
        rows = await AudienceCRUD(self.session).get_all(col(NotificationAudience.message_id) == message_id)
        return [
            AudienceRule.model_validate(
                {
                    "type": row.audience_type,
                    "value": row.audience_value,
                    "include_descendants": row.include_descendants,
                }
            )
            for row in rows
        ]

    async def create_message(
        self,
        command: NotificationCommand,
        *,
        created_by: UUID,
        publish_at: datetime | None = None,
        expire_at: datetime | None = None,
        save_as_draft: bool = False,
    ) -> NotificationMessage:
        """Persist a draft or future-scheduled message without fan-out."""
        action = await resolve_action(
            command.action.model_dump(mode="json") if command.action is not None else None,
            session=self.session,
            provider=self.menu_provider,
            snapshot=False,
        )
        validate_json_shape(command.meta)
        for channel in command.channels:
            if channel not in _ALLOWED_CHANNELS:
                logger.warning("Invalid channel in command: {}", channel)
                raise AppException(NotificationStatusCode.INVALID_CHANNEL)

        rendered, template_id, personalization = await self._resolve_content(command)
        status = MessageStatus.DRAFT.value if save_as_draft or publish_at is None else MessageStatus.SCHEDULED.value
        message = await MessageCRUD(self.session).create(
            {
                "source": command.source,
                "display_mode": "inbox",
                "category": command.category,
                "level": command.level,
                "content_mode": rendered.content_mode,
                "title": rendered.title,
                "content": rendered.content,
                "content_params": command.template_variables
                if command.content_mode == "template"
                else rendered.content_params,
                "content_format": rendered.content_format,
                "mandatory": command.mandatory,
                "channels": list(command.channels),
                "action": action,
                "meta": command.meta,
                "status": status,
                "deduplication_key": command.deduplication_key,
                "correlation_id": uuid4().hex,
                "created_by": created_by,
                "publish_at": publish_at,
                "expire_at": expire_at,
                "template_id": template_id,
                "template_code": command.template_code,
                "personalization": personalization,
            }
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
        return message

    async def update_message(
        self,
        message_id: UUID,
        command: NotificationCommand,
        *,
        publish_at: datetime | None,
        expire_at: datetime | None,
        save_as_draft: bool = False,
    ) -> NotificationMessage:
        """Replace one editable announcement and its audience snapshot."""
        message_crud = MessageCRUD(self.session)
        message = await message_crud.get_for_update(message_id)
        if message is None:
            raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
        if message.status not in {MessageStatus.DRAFT.value, MessageStatus.SCHEDULED.value}:
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        if message.display_mode == "top_banner" and message.status == MessageStatus.SCHEDULED.value:
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        rendered, template_id, personalization = await self._resolve_content(command)
        action = await resolve_action(
            command.action.model_dump(mode="json") if command.action is not None else None,
            session=self.session,
            provider=self.menu_provider,
            snapshot=False,
        )
        validate_json_shape(command.meta)
        status = MessageStatus.DRAFT.value if save_as_draft or publish_at is None else MessageStatus.SCHEDULED.value
        message = await message_crud.update_by_id(
            message_id,
            {
                "display_mode": "inbox",
                "category": command.category,
                "level": command.level,
                "content_mode": rendered.content_mode,
                "title": rendered.title,
                "content": rendered.content,
                "content_params": command.template_variables
                if command.content_mode == "template"
                else rendered.content_params,
                "content_format": rendered.content_format,
                "mandatory": command.mandatory,
                "channels": list(command.channels),
                "action": action,
                "meta": command.meta,
                "status": status,
                "publish_at": publish_at,
                "expire_at": expire_at,
                "template_id": template_id,
                "template_code": command.template_code,
                "personalization": personalization,
            },
        )
        await self.session.exec(delete(NotificationAudience).where(col(NotificationAudience.message_id) == message_id))
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
        return message

    async def delete_message(self, message_id: UUID) -> None:
        """Delete an unpublished announcement and its audience snapshot."""
        message_crud = MessageCRUD(self.session)
        message = await message_crud.get_for_update(message_id)
        if message is None:
            raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
        if message.display_mode != "inbox":
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        if message.status not in {MessageStatus.DRAFT.value, MessageStatus.SCHEDULED.value}:
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        await self.session.exec(delete(NotificationAudience).where(col(NotificationAudience.message_id) == message_id))
        await message_crud.delete(message_id)

    async def publish_message(self, message_id: UUID, *, scheduled_run: bool = False) -> int:
        """Publish a draft or scheduled message using its persisted audience snapshot."""
        message_crud = MessageCRUD(self.session)
        message = await message_crud.get_for_update(message_id)
        if message is None:
            raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
        if message.display_mode != "inbox":
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        if message.status not in {
            MessageStatus.DRAFT.value,
            MessageStatus.SCHEDULED.value,
            MessageStatus.PUBLISHING.value,
        }:
            raise AppException(NotificationStatusCode.MESSAGE_NOT_PUBLISHABLE)

        if (
            message.status == MessageStatus.SCHEDULED.value
            and message.publish_at is not None
            and message.publish_at > timezone.now()
            and not scheduled_run
        ):
            raise AppException(NotificationStatusCode.SCHEDULE_NOT_DUE)

        action = await resolve_action(message.action, session=self.session, provider=self.menu_provider)
        audience_rules = await self._load_audience_rules(message_id)
        message = await message_crud.update_by_id(
            message_id, {"status": MessageStatus.PUBLISHING.value, "action": action}
        )
        return await self._fanout(message, audience_rules)

    async def cancel_message(self, message_id: UUID) -> None:
        """Cancel a draft or scheduled message while holding its lifecycle row lock."""
        message_crud = MessageCRUD(self.session)
        message = await message_crud.get_for_update(message_id)
        if message is None:
            raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
        if message.display_mode != "inbox":
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        if message.status not in {
            MessageStatus.DRAFT.value,
            MessageStatus.SCHEDULED.value,
        }:
            raise AppException(NotificationStatusCode.MESSAGE_NOT_CANCELLABLE)

        await message_crud.update_by_id(
            message_id,
            {
                "status": MessageStatus.CANCELLED.value,
                "cancelled_at": timezone.now(),
            },
        )

    async def recall_message(self, message_id: UUID) -> None:
        """Recall a published message while holding its lifecycle row lock."""
        message_crud = MessageCRUD(self.session)
        message = await message_crud.get_for_update(message_id)
        if message is None:
            raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
        if message.display_mode != "inbox":
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        if message.status != MessageStatus.PUBLISHED.value:
            raise AppException(NotificationStatusCode.MESSAGE_NOT_RECALLABLE)

        await message_crud.update_by_id(
            message_id,
            {
                "status": MessageStatus.RECALLED.value,
                "recalled_at": timezone.now(),
            },
        )
        await OutboxCRUD(self.session).cancel_pending(message_id)

    async def process(self, command: NotificationCommand) -> NotificationResult:
        """Resolve, deduplicate, and persist a notification without committing."""
        action = await resolve_action(
            command.action.model_dump(mode="json") if command.action is not None else None,
            session=self.session,
            provider=self.menu_provider,
        )
        validate_json_shape(command.meta)
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

        rendered, template_id, personalization = await self._resolve_content(command)

        try:
            message = await message_crud.create(
                {
                    "source": command.source,
                    "category": command.category,
                    "level": command.level,
                    "content_mode": rendered.content_mode,
                    "title": rendered.title,
                    "content": rendered.content,
                    "content_params": rendered.content_params,
                    "content_format": rendered.content_format,
                    "mandatory": command.mandatory,
                    "channels": list(command.channels),
                    "action": action,
                    "meta": command.meta,
                    "status": MessageStatus.PUBLISHING.value,
                    "deduplication_key": command.deduplication_key,
                    "correlation_id": uuid4().hex,
                    "created_by": None,
                    "template_id": template_id,
                    "template_code": command.template_code,
                    "personalization": personalization,
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
        recipient_count = await self._fanout(message, command.audience, allow_empty=True)

        return NotificationResult(
            message_id=message.id,
            recipient_count=recipient_count,
            deduplicated=False,
        )
