"""Single global banner lifecycle, independent of inbox and delivery fanout."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_common.protocols.notification import NotificationCommand, NotificationResult
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from sqlmodel import col, delete, select

from plugin_notification.actions import resolve_action
from plugin_notification.audit import audit
from plugin_notification.banner_schemas import (
    BannerCheckResponse,
    BannerPublishRequest,
    BannerSummary,
    TopBannerResponse,
)
from plugin_notification.content import resolve_content
from plugin_notification.crud import MessageCRUD
from plugin_notification.emitter import get_external_sio
from plugin_notification.models import (
    BANNER_STATE_ID,
    NotificationAudience,
    NotificationBannerState,
    NotificationMessage,
)
from plugin_notification.status_codes import NotificationStatusCode

logger = get_plugin_logger("Notification")
BANNER_ROOM = "announcement:authenticated"


def utc(value: datetime | None) -> datetime | None:
    return value.astimezone(UTC).replace(tzinfo=None) if value is not None and value.tzinfo else value


async def emit_banner_changed(revision: int) -> None:
    await get_external_sio().emit(
        "announcement:banner_changed", {"revision": revision}, to=BANNER_ROOM, namespace="/notifications"
    )


class BannerAnnouncementService:
    def __init__(
        self,
        session_factory: Callable[[], Any] = AsyncSessionLocal,
        broadcaster: Callable[[int], Awaitable[Any]] = emit_banner_changed,
    ) -> None:
        self.session_factory = session_factory
        self.broadcaster = broadcaster

    async def broadcast(self, revision: int) -> None:
        try:
            await self.broadcaster(revision)
        except Exception as exc:  # noqa: BLE001 - durable state and polling remain authoritative
            logger.warning("Banner broadcast failed revision={}: {}", revision, exc)

    async def _load(self, session, *, lock=False):
        statement = select(NotificationBannerState).where(col(NotificationBannerState.id) == BANNER_STATE_ID)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        state = (await session.exec(statement)).one_or_none()
        if state is None:
            # Never race to insert the lock row: it must be seeded by migration.
            raise AppException(NotificationStatusCode.BANNER_STATE_MISSING)
        active = await session.get(NotificationMessage, state.active_message_id) if state.active_message_id else None
        scheduled = (
            await session.get(NotificationMessage, state.scheduled_message_id) if state.scheduled_message_id else None
        )
        return state, active, scheduled

    def _project(self, state, active, scheduled, now):
        """Return effective slot plus changes without mutating even attached ORM objects."""
        changes = {}
        revision = state.revision
        if scheduled is not None and scheduled.publish_at is not None and scheduled.publish_at <= now:
            start = scheduled.publish_at
            if active is not None:
                if active.expire_at is not None and active.expire_at <= start:
                    changes[active.id] = {"status": "expired"}
                    revision += 1
                else:
                    changes[active.id] = {
                        "status": "superseded",
                        "superseded_at": start,
                        "superseded_by_id": scheduled.id,
                    }
            changes[scheduled.id] = {"status": "published", "published_at": start}
            active, scheduled = scheduled, None
            revision += 1
        if active is not None and active.expire_at is not None and active.expire_at <= now:
            changes.setdefault(active.id, {}).update(status="expired")
            active = None
            revision += 1
        return active, scheduled, revision, changes

    async def advance_due(self, session, *, now=None):
        loaded = await self._load(session, lock=True)
        # Sample after lock acquisition: lock waits can cross a start/end boundary.
        return await self._advance_locked(session, loaded, now=now or timezone.now())

    async def _advance_locked(self, session, loaded, *, now):
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

    async def _publication_action(self, action, *, session, user=None):
        try:
            return await resolve_action(action, session=session, user=user)
        except AppException as exc:
            if exc.code != NotificationStatusCode.INVALID_ACTION_ROUTE.code:
                raise
            # A menu removed after reservation must not block content or slot cleanup.
            return None

    async def _summary(self, message, changes=None, *, session, user=None):
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
        if values["action"] and values["status"] == "published" and not values["action"].get("path"):
            values["action"] = await self._publication_action(values["action"], session=session, user=user)
        return BannerSummary.model_validate(values)

    async def snapshot(self, session, *, user=None):
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

    async def project_message(self, session, message):
        if message.display_mode != "top_banner":
            return {}
        state, active, scheduled = await self._load(session)
        _, _, _, changes = self._project(state, active, scheduled, timezone.now())
        return changes.get(message.id, {})

    async def _check(self, session, state, active, scheduled, body, message, *, future, now):
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
            and (not future or active.expire_at is None or active.expire_at > message.publish_at)
            and not body.replace_current
        ):
            code = NotificationStatusCode.BANNER_REPLACEMENT_REQUIRED
        elif future and scheduled is not None and scheduled.id != message.id and not body.replace_scheduled:
            code = NotificationStatusCode.BANNER_REPLACEMENT_REQUIRED
        if code is not None:
            raise AppException(code, data=snapshot.model_dump(mode="json", by_alias=True))

    def _validate_window(self, publish_at, expire_at, *, now=None):
        now = now or timezone.now()
        if expire_at is not None and expire_at <= max(publish_at or now, now):
            raise AppException(NotificationStatusCode.INVALID_COMMAND)

    async def _register(self, session, state, active, scheduled, message, body, *, now):
        future = message.publish_at is not None and message.publish_at > now
        self._validate_window(message.publish_at, message.expire_at, now=now)
        await self._check(session, state, active, scheduled, body, message, future=future, now=now)
        if future:
            if scheduled is not None and scheduled.id != message.id:
                scheduled.status, scheduled.cancelled_at = "cancelled", now
                session.add(scheduled)
            message.status = "scheduled"
            state.scheduled_message_id = message.id
        else:
            if active is not None and active.id != message.id:
                active.status, active.superseded_at, active.superseded_by_id = "superseded", now, message.id
                session.add(active)
            if state.scheduled_message_id == message.id:
                state.scheduled_message_id = None
            message.action = await resolve_action(message.action, session=session)
            message.status, message.published_at = "published", now
            state.active_message_id = message.id
        state.revision += 1
        session.add_all([message, state])
        await session.flush()

    async def save(self, command: NotificationCommand, *, operator_id: UUID, body, message_id: UUID | None = None):
        if command.variable_bindings:
            raise AppException(NotificationStatusCode.INVALID_COMMAND)
        async with self.session_factory() as session:
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
                message.status not in {"draft", "scheduled"} or message.status == "scheduled" and body.save_as_draft
            ):
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            if message is not None and message.status == "scheduled" and message.display_mode != "top_banner":
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            original_scheduled_start = (
                message.publish_at if message is not None and message.status == "scheduled" else None
            )
            if not body.save_as_draft:
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
                status="draft",
            ).items():
                setattr(message, key, value)
            session.add(message)
            await session.flush()
            if not body.save_as_draft:
                await self._register(session, state, active, scheduled, message, body, now=now)
            revision = state.revision if state else None
            await session.commit()
        audit(
            "banner.save",
            operator_id=operator_id,
            target_id=message.id,
            banner_revision=revision,
            previous_active_id=active.id if active else None,
            previous_scheduled_id=scheduled.id if scheduled else None,
        )
        if not body.save_as_draft:
            assert revision is not None
            await self.broadcast(revision)
        return NotificationResult(message_id=message.id, recipient_count=0, deduplicated=False)

    async def publish(self, message_id, *, operator_id, body: BannerPublishRequest):
        async with self.session_factory() as session:
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
                if message.status != "draft":
                    raise AppException(NotificationStatusCode.MESSAGE_NOT_PUBLISHABLE)
                await self._register(session, state, active, scheduled, message, body, now=now)
            revision = state.revision
            await session.commit()
        audit(
            "banner.publish",
            operator_id=operator_id,
            target_id=message_id,
            banner_revision=revision,
            previous_active_id=active.id if active else None,
            previous_scheduled_id=scheduled.id if scheduled else None,
        )
        await self.broadcast(revision)
        return NotificationResult(message_id=message_id, recipient_count=0, deduplicated=deduplicated)

    async def remove(self, message_id, *, operator_id, operation):
        async with self.session_factory() as session:
            loaded = await self._load(session, lock=True)
            now = timezone.now()
            state, active, scheduled = await self._advance_locked(session, loaded, now=now)
            message = await MessageCRUD(session).get_for_update(message_id)
            if message is None:
                raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
            if message.display_mode != "top_banner":
                raise AppException(NotificationStatusCode.INVALID_STATE_TRANSITION)
            valid = {"recall": {"published"}, "cancel": {"draft", "scheduled"}, "delete": {"draft", "scheduled"}}
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
                message.status = "recalled" if operation == "recall" else "cancelled"
                setattr(message, "recalled_at" if operation == "recall" else "cancelled_at", now)
                session.add(message)
            if changed:
                state.revision += 1
            revision = state.revision
            session.add(state)
            await session.commit()
        audit(
            "banner." + operation,
            operator_id=operator_id,
            target_id=message_id,
            banner_revision=revision,
            previous_active_id=active.id if active else None,
            previous_scheduled_id=scheduled.id if scheduled else None,
        )
        if changed:
            await self.broadcast(revision)
