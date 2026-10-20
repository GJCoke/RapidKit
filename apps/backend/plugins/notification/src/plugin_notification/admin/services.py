"""Administrative notification lifecycle service."""

from collections.abc import Awaitable, Callable
from datetime import datetime
from uuid import UUID

from rapidkit_common.protocols.notification import (
    AudiencePreview,
    AudienceRule,
    NotificationCommand,
    NotificationResult,
    RecipientVariableBinding,
)
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_common.schemas.response import PaginatedResponse
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from sqlalchemy import case
from sqlmodel import col
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.admin.schemas import (
    AnnouncementCreateRequest,
    AudienceRuleIn,
    MessageAdminDetailResponse,
    MessageAdminResponse,
    MessageListQuery,
)
from plugin_notification.audience import AudienceResolver
from plugin_notification.audit import audit
from plugin_notification.banner.schemas import BannerPublishRequest
from plugin_notification.banner.services import BannerAnnouncementService
from plugin_notification.crud import AudienceCRUD, MessageCRUD, TemplateCRUD
from plugin_notification.enums import MessageStatus
from plugin_notification.models import NotificationAudience, NotificationMessage
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.personalization import prepare_personalization, render_personalized
from plugin_notification.preference.services import PreferenceResolver
from plugin_notification.renderer import RenderedContent
from plugin_notification.services import enqueue_notification_delivery
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.transactions import (
    SessionFactory,
    complete_notification_write,
    defer_notification_effect,
    notification_session,
)

logger = get_plugin_logger("Notification")

EnqueueDelivery = Callable[[], None]
RecallBroadcaster = Callable[[UUID], Awaitable[None]]


def _audience_type_summary(audience: list[AudienceRule]) -> str:
    return ",".join(dict.fromkeys(rule.type for rule in audience))


class AdminNotificationService:
    """Own transaction boundaries for administrative notification operations."""

    def __init__(
        self,
        session_factory: SessionFactory = AsyncSessionLocal,
        query_service: UserQueryService | None = None,
        enqueue_delivery: EnqueueDelivery = enqueue_notification_delivery,
        recall_broadcaster: RecallBroadcaster | None = None,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._session = session
        self._query_service = query_service
        self._enqueue_delivery = enqueue_delivery
        self._recall_broadcaster = recall_broadcaster

    def _resolve_query_service(self) -> UserQueryService:
        if self._query_service is not None:
            return self._query_service
        return get_service(UserQueryService)

    def _orchestrator(self, session: AsyncSession) -> MessageOrchestrator:
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
        save_as_draft: bool = False,
        banner_body: AnnouncementCreateRequest | None = None,
    ) -> NotificationResult:
        """Persist a draft or scheduled message, then audit the committed result."""
        if banner_body is not None:
            return await BannerAnnouncementService(self._session_factory, session=self._session).save(
                command, operator_id=created_by, body=banner_body
            )
        async with notification_session(self._session_factory, self._session) as session:
            message = await self._orchestrator(session).create_message(
                command,
                created_by=created_by,
                publish_at=publish_at,
                expire_at=expire_at,
                save_as_draft=save_as_draft,
            )
            message_id = message.id
            correlation_id = message.correlation_id
            defer_notification_effect(
                session,
                audit,
                "create",
                operator_id=created_by,
                target_id=message_id,
                correlation_id=correlation_id,
                audience_summary=_audience_type_summary(command.audience),
            )
            await complete_notification_write(session, owned=self._session is None)

        return NotificationResult(
            message_id=message_id,
            recipient_count=0,
            deduplicated=False,
        )

    async def get_message(self, message_id: UUID) -> tuple[NotificationMessage, list[NotificationAudience]]:
        async with notification_session(self._session_factory, self._session) as session:
            message = await MessageCRUD(session).get(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            audiences = await AudienceCRUD(session).get_all(col(NotificationAudience.message_id) == message_id)
            return message, audiences

    async def get_message_detail(self, message_id: UUID) -> MessageAdminDetailResponse:
        message, audiences = await self.get_message(message_id)
        detail = to_message_detail(message, audiences)
        if message.display_mode == "top_banner":
            async with notification_session(self._session_factory, self._session) as session:
                patch = await BannerAnnouncementService().project_message(session, message)
            for key, value in patch.items():
                if key in type(detail).model_fields:
                    setattr(detail, key, value)
        return detail

    async def update_message(
        self,
        message_id: UUID,
        command: NotificationCommand,
        *,
        operator_id: UUID,
        publish_at: datetime | None,
        expire_at: datetime | None,
        save_as_draft: bool = False,
        banner_body: AnnouncementCreateRequest | None = None,
    ) -> NotificationMessage:
        existing, _ = await self.get_message(message_id)
        if (
            existing.display_mode == "top_banner"
            and existing.status == MessageStatus.SCHEDULED.value
            and banner_body is None
        ):
            raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
        if banner_body is not None:
            await BannerAnnouncementService(self._session_factory, session=self._session).save(
                command, operator_id=operator_id, body=banner_body, message_id=message_id
            )
            return (await self.get_message(message_id))[0]
        async with notification_session(self._session_factory, self._session) as session:
            message = await self._orchestrator(session).update_message(
                message_id,
                command,
                publish_at=publish_at,
                expire_at=expire_at,
                save_as_draft=save_as_draft,
            )
            correlation_id = message.correlation_id
            defer_notification_effect(
                session, audit, "update", operator_id=operator_id, target_id=message_id, correlation_id=correlation_id
            )
            await complete_notification_write(session, owned=self._session is None)

        return message

    async def delete_message(self, message_id: UUID, *, operator_id: UUID) -> None:
        existing, _ = await self.get_message(message_id)
        if existing.display_mode == "top_banner":
            await BannerAnnouncementService(self._session_factory, session=self._session).remove(
                message_id, operator_id=operator_id, operation="delete"
            )
            return
        async with notification_session(self._session_factory, self._session) as session:
            message = await MessageCRUD(session).get(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            correlation_id = message.correlation_id
            await self._orchestrator(session).delete_message(message_id)
            defer_notification_effect(
                session, audit, "delete", operator_id=operator_id, target_id=message_id, correlation_id=correlation_id
            )
            await complete_notification_write(session, owned=self._session is None)

    async def publish(
        self,
        message_id: UUID,
        *,
        operator_id: UUID,
        banner_body: BannerPublishRequest | None = None,
    ) -> NotificationResult:
        """Publish and commit before requesting asynchronous delivery."""
        existing, _ = await self.get_message(message_id)
        if existing.display_mode == "top_banner":
            return await BannerAnnouncementService(self._session_factory, session=self._session).publish(
                message_id, operator_id=operator_id, body=banner_body or BannerPublishRequest()
            )
        async with notification_session(self._session_factory, self._session) as session:
            recipient_count = await self._orchestrator(session).publish_message(message_id)
            message = await MessageCRUD(session).get(message_id, nullable=False)
            correlation_id = message.correlation_id
            defer_notification_effect(session, self.enqueue_delivery)

            defer_notification_effect(
                session,
                audit,
                "publish",
                operator_id=operator_id,
                target_id=message_id,
                correlation_id=correlation_id,
            )
            await complete_notification_write(session, owned=self._session is None)

        return NotificationResult(
            message_id=message_id,
            recipient_count=recipient_count,
            deduplicated=False,
        )

    async def cancel(self, message_id: UUID, *, operator_id: UUID) -> None:
        """Cancel and commit before recording the audit event."""
        existing, _ = await self.get_message(message_id)
        if existing.display_mode == "top_banner":
            await BannerAnnouncementService(self._session_factory, session=self._session).remove(
                message_id, operator_id=operator_id, operation="cancel"
            )
            return
        async with notification_session(self._session_factory, self._session) as session:
            await self._orchestrator(session).cancel_message(message_id)
            message = await MessageCRUD(session).get(message_id, nullable=False)
            correlation_id = message.correlation_id
            defer_notification_effect(
                session,
                audit,
                "cancel",
                operator_id=operator_id,
                target_id=message_id,
                correlation_id=correlation_id,
            )
            await complete_notification_write(session, owned=self._session is None)

    async def recall(self, message_id: UUID, *, operator_id: UUID) -> None:
        """Recall and commit before broadcasting, isolating broadcast failures."""
        existing, _ = await self.get_message(message_id)
        if existing.display_mode == "top_banner":
            await BannerAnnouncementService(self._session_factory, session=self._session).remove(
                message_id, operator_id=operator_id, operation="recall"
            )
            return
        async with notification_session(self._session_factory, self._session) as session:
            await self._orchestrator(session).recall_message(message_id)
            message = await MessageCRUD(session).get(message_id, nullable=False)
            correlation_id = message.correlation_id
            defer_notification_effect(session, self._broadcast_recall, message_id)

            defer_notification_effect(
                session,
                audit,
                "recall",
                operator_id=operator_id,
                target_id=message_id,
                correlation_id=correlation_id,
            )
            await complete_notification_write(session, owned=self._session is None)

    async def _broadcast_recall(self, message_id: UUID) -> None:
        if self._recall_broadcaster is not None:
            try:
                await self._recall_broadcaster(message_id)
            except Exception as exc:  # noqa: BLE001 - database remains the source of truth
                logger.warning(
                    "Recall broadcast failed for message_id={}: {}",
                    message_id,
                    exc,
                )

    async def preview_content(
        self,
        *,
        template_code: str,
        template_variables: dict,
        variable_bindings: dict[str, RecipientVariableBinding],
        audience: list[AudienceRule],
        preview_user_id: UUID | None = None,
    ) -> RenderedContent:
        """Read and render public recipient data without writing or enqueueing."""
        async with notification_session(self._session_factory, self._session) as session:
            template = await TemplateCRUD(session).get_by_code(template_code)
            if template is None:
                raise AppException(NotificationStatusCode.TEMPLATE_NOT_FOUND)
            rendered, config = prepare_personalization(template, template_variables, variable_bindings)
            if config is None:
                return rendered
            if preview_user_id is None:
                raise AppException(NotificationStatusCode.INVALID_COMMAND)
            resolver = AudienceResolver(self._resolve_query_service())
            user_ids = await resolver.resolve(audience)
            if preview_user_id not in user_ids:
                raise AppException(NotificationStatusCode.INVALID_COMMAND)
            profiles = await resolver.get_public_profiles([preview_user_id])
            if preview_user_id not in profiles:
                raise AppException(NotificationStatusCode.INVALID_COMMAND)
            return render_personalized(config, profiles[preview_user_id])

    async def preview_audience(
        self,
        audience: list[AudienceRule],
    ) -> AudiencePreview:
        """Estimate unique recipients overall and independently per rule type."""
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


def to_message_detail(
    message: NotificationMessage, audiences: list[NotificationAudience]
) -> MessageAdminDetailResponse:
    return MessageAdminDetailResponse.model_validate(
        {
            **dict(MessageAdminResponse.model_validate(message)),
            "content_params": message.content_params,
            "variable_bindings": (message.personalization or {}).get("bindings", {}),
            "content_format": message.content_format,
            "channels": message.channels,
            "action": message.action,
            "meta": message.meta,
            "template_id": message.template_id,
            "template_code": message.template_code,
            "audiences": [
                AudienceRuleIn.model_validate(
                    {
                        "type": row.audience_type,
                        "value": row.audience_value,
                        "include_descendants": row.include_descendants,
                    }
                )
                for row in audiences
            ],
        }
    )


async def list_messages(crud: MessageCRUD, query: MessageListQuery) -> PaginatedResponse[MessageAdminResponse]:
    filters = []
    projection = await BannerAnnouncementService().project_changes(crud.session, required=False)
    status_expr = (
        case(
            *[(col(NotificationMessage.id) == key, patch["status"]) for key, patch in projection.items()],
            else_=col(NotificationMessage.status),
        )
        if projection
        else col(NotificationMessage.status)
    )
    if query.status is not None:
        filters.append(status_expr == query.status.value)
    if query.display_mode is not None:
        filters.append(col(NotificationMessage.display_mode) == query.display_mode)
    if query.category is not None:
        filters.append(col(NotificationMessage.category) == query.category)
    page = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(NotificationMessage.id).desc(),
        schema=MessageAdminResponse,
    )
    for record in page.records:
        for key, value in projection.get(record.id, {}).items():
            if key in type(record).model_fields:
                setattr(record, key, value)
    return page
