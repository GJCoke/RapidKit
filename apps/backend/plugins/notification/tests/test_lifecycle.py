"""Message lifecycle and two-phase orchestration tests."""

from datetime import timedelta
from typing import Any, cast
from uuid import uuid4

import plugin_notification.crud as notification_crud
import pytest
from plugin_notification.audience import AudienceResolver
from plugin_notification.crud import MessageCRUD, TemplateCRUD
from plugin_notification.enums import MessageStatus
from plugin_notification.models import NotificationTemplate, UserNotification
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference import PreferenceResolver
from plugin_notification.status_codes import NotificationStatusCode
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from sqlalchemy.dialects import postgresql
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession


def _orchestrator(session, audience_ids):
    class _QueryService:
        async def get_active_user_ids(self, user_ids):
            return list(user_ids)

        async def get_active_user_ids_by_role(self, role_code):
            return []

        async def get_active_user_ids_by_department(self, department_id, include_descendants=False):
            return []

        async def get_all_active_user_ids(self):
            return list(audience_ids)

    return MessageOrchestrator(
        session=session,
        audience_resolver=AudienceResolver(query_service=cast(UserQueryService, _QueryService())),
        preference_resolver=PreferenceResolver(session=session),
    )


def _raw_command(*, audience=None):
    return NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="info",
        raw_title="Maintenance",
        raw_content="Maintenance tonight",
        audience=audience or [AudienceRule(type="all")],
    )


def _template_data():
    return {
        "code": "user.invited",
        "name": "Invitation",
        "category": "user.invited",
        "level": "info",
        "content_mode": "raw",
        "title_template": "Invite {username}",
        "content_template": "Welcome {username}",
        "content_format": "plain_text",
        "variable_schema": {"username": {"type": "string", "required": True}},
        "default_channels": ["in_app"],
        "default_action": None,
        "mandatory": False,
        "enabled": True,
        "version": 1,
    }


@pytest.mark.asyncio
async def test_template_crud_get_by_code_returns_matching_template(db_session):
    """A persisted template can be looked up through its public code."""
    template_crud_class = getattr(notification_crud, "TemplateCRUD", None)
    assert template_crud_class is not None

    crud = template_crud_class(db_session)
    created = await crud.create(_template_data())

    found = await crud.get_by_code("user.invited")

    assert isinstance(found, NotificationTemplate)
    assert found.id == created.id


@pytest.mark.asyncio
async def test_create_message_without_publish_time_stays_draft_without_fanout(db_session):
    orchestrator = _orchestrator(db_session, [uuid4()])

    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    await db_session.commit()

    assert message.status == MessageStatus.DRAFT.value
    assert (await db_session.exec(select(UserNotification))).all() == []


@pytest.mark.asyncio
async def test_create_message_with_future_publish_time_is_scheduled(db_session):
    orchestrator = _orchestrator(db_session, [uuid4()])
    future = timezone.now() + timedelta(hours=1)

    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=future,
        expire_at=None,
    )

    assert message.status == MessageStatus.SCHEDULED.value
    assert message.publish_at == future


@pytest.mark.asyncio
async def test_create_message_with_past_publish_time_is_scheduled(db_session):
    orchestrator = _orchestrator(db_session, [uuid4()])
    past = timezone.now() - timedelta(seconds=1)

    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=past,
        expire_at=None,
    )

    assert message.status == MessageStatus.SCHEDULED.value


@pytest.mark.asyncio
async def test_message_crud_get_for_update_emits_postgresql_row_lock():
    class _EmptyResult:
        def first(self):
            return None

    class _RecordingSession:
        statement: Any = None

        async def exec(self, statement):
            self.statement = statement
            return _EmptyResult()

    session = _RecordingSession()
    crud = MessageCRUD(cast(AsyncSession, session))

    assert await crud.get_for_update(uuid4()) is None
    compiled = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled


@pytest.mark.asyncio
async def test_publish_message_fans_out_and_marks_message_published(db_session):
    first_user_id, second_user_id = uuid4(), uuid4()
    orchestrator = _orchestrator(db_session, [first_user_id, second_user_id])
    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    await db_session.commit()

    recipient_count = await orchestrator.publish_message(message.id)
    await db_session.commit()

    refreshed = await MessageCRUD(db_session).get(message.id)
    assert recipient_count == 2
    assert refreshed is not None
    assert refreshed.status == MessageStatus.PUBLISHED.value
    assert refreshed.published_at is not None
    inbox = (await db_session.exec(select(UserNotification))).all()
    assert {row.user_id for row in inbox} == {first_user_id, second_user_id}


@pytest.mark.asyncio
async def test_publish_message_uses_persisted_audience_snapshot(db_session):
    snapshotted_user_id, mutated_user_id = uuid4(), uuid4()
    command = _raw_command(audience=[AudienceRule(type="user", value=str(snapshotted_user_id))])
    orchestrator = _orchestrator(db_session, [])
    message = await orchestrator.create_message(
        command,
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    await db_session.commit()
    command.audience = [AudienceRule(type="user", value=str(mutated_user_id))]

    await orchestrator.publish_message(message.id)
    await db_session.commit()

    inbox = (await db_session.exec(select(UserNotification))).all()
    assert {row.user_id for row in inbox} == {snapshotted_user_id}


@pytest.mark.asyncio
async def test_publish_message_rejects_already_published_message(db_session):
    orchestrator = _orchestrator(db_session, [uuid4()])
    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    await db_session.commit()
    await orchestrator.publish_message(message.id)
    await db_session.commit()

    with pytest.raises(AppException):
        await orchestrator.publish_message(message.id)


@pytest.mark.asyncio
async def test_create_message_template_mode_persists_rendered_snapshot(db_session):
    await TemplateCRUD(db_session).create(_template_data())
    await db_session.commit()
    orchestrator = _orchestrator(db_session, [uuid4()])
    command = NotificationCommand(
        source="user",
        category="user.invited",
        level="info",
        template_code="user.invited",
        template_variables={"username": "alice"},
        audience=[AudienceRule(type="all")],
    )

    message = await orchestrator.create_message(
        command,
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )

    assert message.content_mode == "raw"
    assert message.title == "Invite alice"
    assert message.content == "Welcome alice"
    assert message.template_id is not None


@pytest.mark.asyncio
async def test_recall_only_allows_published_messages(db_session):
    user_id = uuid4()
    orchestrator = _orchestrator(db_session, [user_id])
    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    await db_session.commit()

    with pytest.raises(AppException) as exc_info:
        await orchestrator.recall_message(message.id)
    assert exc_info.value.code == NotificationStatusCode.MESSAGE_NOT_RECALLABLE.code

    await orchestrator.publish_message(message.id)
    await db_session.commit()
    await orchestrator.recall_message(message.id)
    await db_session.commit()

    refreshed = await MessageCRUD(db_session).get(message.id)
    assert refreshed is not None
    assert refreshed.status == MessageStatus.RECALLED.value
    assert refreshed.recalled_at is not None

    with pytest.raises(AppException) as second_exc_info:
        await orchestrator.recall_message(message.id)
    assert second_exc_info.value.code == NotificationStatusCode.MESSAGE_NOT_RECALLABLE.code


@pytest.mark.asyncio
@pytest.mark.parametrize("publish_at", [None, timezone.now() + timedelta(hours=1)])
async def test_cancel_only_allows_draft_or_scheduled_messages(db_session, publish_at):
    orchestrator = _orchestrator(db_session, [uuid4()])
    message = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=publish_at,
        expire_at=None,
    )
    await db_session.commit()

    await orchestrator.cancel_message(message.id)
    await db_session.commit()

    refreshed = await MessageCRUD(db_session).get(message.id)
    assert refreshed is not None
    assert refreshed.status == MessageStatus.CANCELLED.value
    assert refreshed.cancelled_at is not None

    with pytest.raises(AppException) as exc_info:
        await orchestrator.cancel_message(message.id)
    assert exc_info.value.code == NotificationStatusCode.MESSAGE_NOT_CANCELLABLE.code


@pytest.mark.asyncio
async def test_cancel_and_recall_lock_message_before_transition(db_session, monkeypatch):
    orchestrator = _orchestrator(db_session, [uuid4()])
    draft = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    published = await orchestrator.create_message(
        _raw_command(),
        created_by=uuid4(),
        publish_at=None,
        expire_at=None,
    )
    await db_session.commit()
    await orchestrator.publish_message(published.id)
    await db_session.commit()

    locked_ids = []
    original_get_for_update = MessageCRUD.get_for_update

    async def recording_get_for_update(crud, message_id):
        locked_ids.append(message_id)
        return await original_get_for_update(crud, message_id)

    monkeypatch.setattr(MessageCRUD, "get_for_update", recording_get_for_update)

    await orchestrator.cancel_message(draft.id)
    await orchestrator.recall_message(published.id)

    assert locked_ids == [draft.id, published.id]
