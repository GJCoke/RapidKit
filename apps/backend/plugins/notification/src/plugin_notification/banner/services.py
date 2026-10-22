"""Single global banner lifecycle, independent of inbox and delivery fanout."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, Literal, cast, overload
from uuid import UUID, uuid4

from rapidkit_common.auth import UserProtocol
from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_common.protocols.notification import NotificationCommand, NotificationResult
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col, delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.actions import resolve_action
from plugin_notification.admin.schemas import AnnouncementCreateRequest
from plugin_notification.audit import audit
from plugin_notification.banner.schemas import (
    BannerCheckResponse,
    BannerPublishRequest,
    BannerSummary,
    TopBannerResponse,
)
from plugin_notification.content import resolve_content
from plugin_notification.crud import MessageCRUD
from plugin_notification.emitter import get_external_sio
from plugin_notification.enums import MessageStatus
from plugin_notification.models import (
    BANNER_STATE_ID,
    NotificationAudience,
    NotificationBannerState,
    NotificationMessage,
)
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.transactions import (
    SessionFactory,
    complete_notification_write,
    defer_notification_effect,
    notification_session,
)

logger = get_plugin_logger("Notification")
BANNER_ROOM = "announcement:authenticated"

type BannerSlots = tuple[NotificationBannerState, NotificationMessage | None, NotificationMessage | None]
type BannerChanges = dict[UUID, dict[str, Any]]
type BannerConsent = AnnouncementCreateRequest | BannerPublishRequest


def utc(value: datetime | None) -> datetime | None:
    return value.astimezone(UTC).replace(tzinfo=None) if value is not None and value.tzinfo else value


async def emit_banner_changed(revision: int) -> None:
    await get_external_sio().emit(
        "announcement:banner_changed", {"revision": revision}, to=BANNER_ROOM, namespace="/notifications"
    )


class BannerAnnouncementService:
    def __init__(
        self,
        session_factory: SessionFactory = AsyncSessionLocal,
        broadcaster: Callable[[int], Awaitable[None]] = emit_banner_changed,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        self.session_factory = session_factory
        self._session = session
        self.broadcaster = broadcaster
        self.transitioned = False

    async def broadcast(self, revision: int) -> None:
        try:
            await self.broadcaster(revision)
        except Exception as exc:  # noqa: BLE001 - durable state and polling remain authoritative
            logger.warning("Banner broadcast failed revision={}: {}", revision, exc)

    async def _load(self, session: AsyncSession, *, lock: bool = False) -> BannerSlots:
        statement = select(NotificationBannerState).where(col(NotificationBannerState.id) == BANNER_STATE_ID)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        state = (await session.exec(statement)).one_or_none()
        if state is None:
            existing_banner = (
                await session.exec(
                    select(NotificationMessage.id)
                    .where(
                        col(NotificationMessage.display_mode) == "top_banner",
                        col(NotificationMessage.status).in_(
                            [MessageStatus.PUBLISHED.value, MessageStatus.SCHEDULED.value]
                        ),
                    )
                    .limit(1)
                )
            ).first()
            if existing_banner is not None:
                # A concurrent first publication may have committed since the initial read.
                state = (await session.exec(statement)).one_or_none()
                if state is None:
                    raise AppException(NotificationStatusCode.BANNER_STATE_MISSING)
        if state is None:
            if lock:
                now = timezone.now()
                await session.exec(
                    insert(NotificationBannerState)
                    .values(id=BANNER_STATE_ID, create_time=now, update_time=now, revision=0)
                    .on_conflict_do_nothing(index_elements=["id"])
                )
                state = (await session.exec(statement)).one()
            else:
                state = NotificationBannerState(id=BANNER_STATE_ID)
        active = await session.get(NotificationMessage, state.active_message_id) if state.active_message_id else None
        scheduled = (
            await session.get(NotificationMessage, state.scheduled_message_id) if state.scheduled_message_id else None
        )
        return state, active, scheduled

    def _project(
        self,
        state: NotificationBannerState,
        active: NotificationMessage | None,
        scheduled: NotificationMessage | None,
        now: datetime,
    ) -> tuple[NotificationMessage | None, NotificationMessage | None, int, BannerChanges]:
        """Return effective slot plus changes without mutating even attached ORM objects."""
        changes: BannerChanges = {}
        revision = state.revision
        if scheduled is not None and scheduled.publish_at is not None and scheduled.publish_at <= now:
            start = scheduled.publish_at
            if active is not None:
                if active.expire_at is not None and active.expire_at <= start:
                    changes[active.id] = {"status": MessageStatus.EXPIRED.value}
                    revision += 1
                else:
                    changes[active.id] = {
                        "status": MessageStatus.SUPERSEDED.value,
                        "superseded_at": start,
                        "superseded_by_id": scheduled.id,
                    }
            changes[scheduled.id] = {"status": MessageStatus.PUBLISHED.value, "published_at": start}
            active, scheduled = scheduled, None
            revision += 1
        if active is not None and active.expire_at is not None and active.expire_at <= now:
            changes.setdefault(active.id, {}).update(status=MessageStatus.EXPIRED.value)
            active = None
            revision += 1
        return active, scheduled, revision, changes

    async def advance_due(self, session: AsyncSession, *, now: datetime | None = None) -> BannerSlots:
        loaded = await self._load(session, lock=True)
        # Sample after lock acquisition: lock waits can cross a start/end boundary.
        return await self._advance_locked(session, loaded, now=now or timezone.now())

    async def _advance_locked(self, session: AsyncSession, loaded: BannerSlots, *, now: datetime) -> BannerSlots:
        state, old_active, old_scheduled = loaded
        active, scheduled, revision, changes = self._project(state, old_active, old_scheduled, now)
        for message in (old_active, old_scheduled):
            if message is not None and message.id in changes:
                for key, value in changes[message.id].items():
                    setattr(message, key, value)
                if message.published_at is not None and message is old_scheduled:
                    message.action = await self._publication_action(message.action, session=session)
                session.add(message)
        self.transitioned = state.revision != revision
        state.active_message_id = active.id if active else None
        state.scheduled_message_id = scheduled.id if scheduled else None
        state.revision = revision
        session.add(state)
        await session.flush()
        if self.transitioned:
            logger.info(
                "Banner transition revision={} previous_active_id={} previous_scheduled_id={} "
                "active_id={} scheduled_id={} at={}",
                revision,
                old_active.id if old_active else None,
                old_scheduled.id if old_scheduled else None,
                state.active_message_id,
                state.scheduled_message_id,
                now,
            )
        return state, active, scheduled

    async def _publication_action(
        self,
        action: dict[str, Any] | None,
        *,
        session: AsyncSession,
        user: UserProtocol | None = None,
    ) -> dict[str, Any] | None:
        try:
            return await resolve_action(action, session=session, user=user)
        except AppException as exc:
            if exc.code != NotificationStatusCode.INVALID_ACTION_ROUTE.code:
                raise
            # A menu removed after reservation must not block content or slot cleanup.
            return None

    async def _summary(
        self,
        message: NotificationMessage | None,
        changes: BannerChanges | None = None,
        *,
        session: AsyncSession,
        user: UserProtocol | None = None,
    ) -> BannerSummary | None:
        if message is None:
            return None
        values = {name: getattr(message, name) for name in BannerSummary.model_fields}
        values.update((changes or {}).get(message.id, {}))
        if user is not None and message.action and message.action.get("type") == "menu":
            provider = get_service(MenuNavigationProvider)
            target = await provider.get_target(session, UUID(message.action["menu_id"]), user)
            if target is None:
                values["action"] = None
        # A due reservation may be read before the worker has captured its action.
        if values["action"] and values["status"] == MessageStatus.PUBLISHED.value and not values["action"].get("path"):
            values["action"] = await self._publication_action(values["action"], session=session, user=user)
        return BannerSummary.model_validate(values)

    @overload
    async def snapshot(self, session: AsyncSession, *, user: None = None) -> BannerCheckResponse: ...

    @overload
    async def snapshot(self, session: AsyncSession, *, user: UserProtocol) -> TopBannerResponse: ...

    async def snapshot(
        self,
        session: AsyncSession,
        *,
        user: UserProtocol | None = None,
    ) -> BannerCheckResponse | TopBannerResponse:
        state, active, scheduled = await self._load(session)
        now = timezone.now()
        active, scheduled, revision, changes = self._project(state, active, scheduled, now)
        current = await self._summary(active, changes, session=session, user=user)
        if user is not None:
            times = [
                value
                for value in (active.expire_at if active else None, scheduled.publish_at if scheduled else None)
                if value and value > now
            ]
            return TopBannerResponse(
                current=current, revision=revision, server_now=now, next_change_at=min(times) if times else None
            )
        return BannerCheckResponse(
            current=current,
            scheduled=await self._summary(scheduled, session=session),
            revision=revision,
            server_now=now,
        )

    async def project_changes(self, session: AsyncSession, *, required: bool = True) -> BannerChanges:
        """Project effective banner states without changing persisted rows."""
        if not required:
            state = (
                await session.exec(
                    select(NotificationBannerState).where(col(NotificationBannerState.id) == BANNER_STATE_ID)
                )
            ).one_or_none()
            if state is None:
                return {}
        state, active, scheduled = await self._load(session)
        _, _, _, changes = self._project(state, active, scheduled, timezone.now())
        return changes

    async def project_message(self, session: AsyncSession, message: NotificationMessage) -> dict[str, Any]:
        if message.display_mode != "top_banner":
            return {}
        changes = await self.project_changes(session)
        return changes.get(message.id, {})

    async def _check(
        self,
        session: AsyncSession,
        state: NotificationBannerState,
        active: NotificationMessage | None,
        scheduled: NotificationMessage | None,
        body: BannerConsent,
        message: NotificationMessage | SimpleNamespace,
        *,
        future: bool,
        now: datetime,
    ) -> None:
        snapshot = BannerCheckResponse(
            revision=state.revision,
            server_now=now,
            current=await self._summary(active, session=session),
            scheduled=await self._summary(scheduled, session=session),
        )
        code = None
        if body.banner_revision != state.revision:
            code = NotificationStatusCode.BANNER_REVISION_CONFLICT
        elif (
            active is not None
            and active.id != message.id
            and (not future or active.expire_at is None or active.expire_at > cast(datetime, message.publish_at))
            and not body.replace_current
        ):
            code = NotificationStatusCode.BANNER_REPLACEMENT_REQUIRED
        elif future and scheduled is not None and scheduled.id != message.id and not body.replace_scheduled:
            code = NotificationStatusCode.BANNER_REPLACEMENT_REQUIRED
        if code is not None:
            raise AppException(code, data=snapshot.model_dump(mode="json", by_alias=True))

    def validate_window(
        self,
        publish_at: datetime | None,
        expire_at: datetime | None,
        *,
        now: datetime | None = None,
    ) -> None:
        now = now or timezone.now()
        if expire_at is not None and expire_at <= max(publish_at or now, now):
            raise AppException(NotificationStatusCode.INVALID_COMMAND)

    async def _register(
        self,
        session: AsyncSession,
        state: NotificationBannerState,
        active: NotificationMessage | None,
        scheduled: NotificationMessage | None,
        message: NotificationMessage,
        body: BannerConsent,
        *,
        now: datetime,
    ) -> None:
        future = message.publish_at is not None and message.publish_at > now
        self.validate_window(message.publish_at, message.expire_at, now=now)
        await self._check(session, state, active, scheduled, body, message, future=future, now=now)
        if future:
            if scheduled is not None and scheduled.id != message.id:
                scheduled.status, scheduled.cancelled_at = MessageStatus.CANCELLED.value, now
                session.add(scheduled)
            message.status = MessageStatus.SCHEDULED.value
            state.scheduled_message_id = message.id
        else:
            if active is not None and active.id != message.id:
                active.status, active.superseded_at, active.superseded_by_id = (
                    MessageStatus.SUPERSEDED.value,
                    now,
                    message.id,
                )
                session.add(active)
            if state.scheduled_message_id == message.id:
                state.scheduled_message_id = None
            message.action = await resolve_action(message.action, session=session)
            message.status, message.published_at = MessageStatus.PUBLISHED.value, now
            state.active_message_id = message.id
        state.revision += 1
        session.add_all([message, state])
        await session.flush()

    async def save(
        self,
        command: NotificationCommand,
        *,
        operator_id: UUID,
        body: AnnouncementCreateRequest,
        message_id: UUID | None = None,
    ) -> NotificationResult:
        if command.variable_bindings:
            raise AppException(NotificationStatusCode.INVALID_COMMAND)
        async with notification_session(self.session_factory, self._session) as session:
            # Always lock slot before message to maintain a single lock order.
            state = active = scheduled = None
            nonce_key = None
            now = None
            if not body.save_as_draft:
                loaded = await self._load(session, lock=True)
                now = timezone.now()
                if message_id is None and body.client_request_id is not None:
                    nonce_key = f"banner:{operator_id}:{body.client_request_id}"
                    existing = await MessageCRUD(session).get_by_source_dedup("admin", nonce_key)
                    if existing is not None:
                        # A lost committed response must never republish history or advance the slot.
                        return NotificationResult(message_id=existing.id, recipient_count=0, deduplicated=True)
                state, active, scheduled = await self._advance_locked(session, loaded, now=now)
            elif message_id is not None:
                state, active, scheduled = await self._load(session, lock=True)
            message = await MessageCRUD(session).get_for_update(message_id) if message_id else None
            if message_id and message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            if message is not None and (
                message.status not in {MessageStatus.DRAFT.value, MessageStatus.SCHEDULED.value}
                or message.status == MessageStatus.SCHEDULED.value
                and body.save_as_draft
            ):
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            if (
                message is not None
                and message.status == MessageStatus.SCHEDULED.value
                and message.display_mode != "top_banner"
            ):
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            original_scheduled_start = (
                message.publish_at if message is not None and message.status == MessageStatus.SCHEDULED.value else None
            )
            if not body.save_as_draft:
                assert state is not None and now is not None
                candidate = SimpleNamespace(id=message.id if message else None, publish_at=utc(body.publish_at))
                await self._check(
                    session,
                    state,
                    active,
                    scheduled,
                    body,
                    candidate,
                    future=candidate.publish_at is not None and candidate.publish_at > now,
                    now=now,
                )
            if message is not None and message.display_mode == "inbox":
                await session.exec(
                    delete(NotificationAudience).where(col(NotificationAudience.message_id) == message.id)
                )
            rendered, template_id, personalization = await resolve_content(session, command)
            if personalization:
                raise AppException(NotificationStatusCode.INVALID_COMMAND)
            action = await resolve_action(
                command.action.model_dump(mode="json") if command.action else None, session=session, snapshot=False
            )
            finished_at = timezone.now() if original_scheduled_start is not None else None
            if (
                original_scheduled_start is not None
                and finished_at is not None
                and original_scheduled_start <= finished_at
            ):
                # Unlocked reads already expose the original reservation after its start.
                # Rendering must not rewrite that effective publication or postpone it.
                assert state is not None
                await self._advance_locked(session, (state, active, scheduled), now=finished_at)
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            if message is None:
                message = NotificationMessage(
                    source="admin",
                    category=command.category,
                    content_mode=rendered.content_mode,
                    title=rendered.title,
                    content=rendered.content,
                    correlation_id=uuid4().hex,
                    created_by=operator_id,
                    deduplication_key=nonce_key,
                )
            for key, value in dict(
                display_mode="top_banner",
                category=command.category,
                level=command.level,
                content_mode=rendered.content_mode,
                title=rendered.title,
                content=rendered.content,
                content_params=command.template_variables
                if command.content_mode == "template"
                else rendered.content_params,
                content_format=rendered.content_format,
                template_id=template_id,
                template_code=command.template_code,
                channels=[],
                mandatory=False,
                action=action,
                personalization=None,
                publish_at=utc(body.publish_at),
                expire_at=utc(body.expire_at),
                status=MessageStatus.DRAFT.value,
            ).items():
                setattr(message, key, value)
            session.add(message)
            await session.flush()
            if not body.save_as_draft:
                assert state is not None and now is not None
                await self._register(session, state, active, scheduled, message, body, now=now)
            revision = state.revision if state else None
            defer_notification_effect(
                session,
                audit,
                "banner.save",
                operator_id=operator_id,
                target_id=message.id,
                banner_revision=revision,
                previous_active_id=active.id if active else None,
                previous_scheduled_id=scheduled.id if scheduled else None,
            )
            if not body.save_as_draft:
                assert revision is not None
                defer_notification_effect(session, self.broadcast, revision)
            await complete_notification_write(session, owned=self._session is None)

        return NotificationResult(message_id=message.id, recipient_count=0, deduplicated=False)

    async def publish(
        self,
        message_id: UUID,
        *,
        operator_id: UUID,
        body: BannerPublishRequest,
    ) -> NotificationResult:
        async with notification_session(self.session_factory, self._session) as session:
            loaded = await self._load(session, lock=True)
            now = timezone.now()
            state, active, scheduled = await self._advance_locked(session, loaded, now=now)
            message = await MessageCRUD(session).get_for_update(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            if message.display_mode != "top_banner":
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            deduplicated = message.published_at is not None or state.scheduled_message_id == message.id
            if not deduplicated:
                if message.status != MessageStatus.DRAFT.value:
                    raise AppException(NotificationStatusCode.MESSAGE_NOT_PUBLISHABLE)
                await self._register(session, state, active, scheduled, message, body, now=now)
            revision = state.revision
            defer_notification_effect(
                session,
                audit,
                "banner.publish",
                operator_id=operator_id,
                target_id=message_id,
                banner_revision=revision,
                previous_active_id=active.id if active else None,
                previous_scheduled_id=scheduled.id if scheduled else None,
            )
            defer_notification_effect(session, self.broadcast, revision)
            await complete_notification_write(session, owned=self._session is None)

        return NotificationResult(message_id=message_id, recipient_count=0, deduplicated=deduplicated)

    async def remove(
        self,
        message_id: UUID,
        *,
        operator_id: UUID,
        operation: Literal["recall", "cancel", "delete"],
    ) -> None:
        async with notification_session(self.session_factory, self._session) as session:
            loaded = await self._load(session, lock=True)
            now = timezone.now()
            state, active, scheduled = await self._advance_locked(session, loaded, now=now)
            message = await MessageCRUD(session).get_for_update(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            if message.display_mode != "top_banner":
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            valid = {
                "recall": {MessageStatus.PUBLISHED.value},
                "cancel": {MessageStatus.DRAFT.value, MessageStatus.SCHEDULED.value},
                "delete": {MessageStatus.DRAFT.value, MessageStatus.SCHEDULED.value},
            }
            if message.status not in valid[operation]:
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            changed = False
            if state.active_message_id == message.id:
                state.active_message_id = None
                changed = True
            if state.scheduled_message_id == message.id:
                state.scheduled_message_id = None
                changed = True
            if operation == "delete":
                await session.delete(message)
            else:
                message.status = (
                    MessageStatus.RECALLED.value if operation == "recall" else MessageStatus.CANCELLED.value
                )
                setattr(message, "recalled_at" if operation == "recall" else "cancelled_at", now)
                session.add(message)
            if changed:
                state.revision += 1
            revision = state.revision
            session.add(state)
            defer_notification_effect(
                session,
                audit,
                "banner." + operation,
                operator_id=operator_id,
                target_id=message_id,
                banner_revision=revision,
                previous_active_id=active.id if active else None,
                previous_scheduled_id=scheduled.id if scheduled else None,
            )
            if changed:
                defer_notification_effect(session, self.broadcast, revision)
            await complete_notification_write(session, owned=self._session is None)
