"""编排器与偏好/受众相关测试。"""

from typing import cast
from uuid import uuid4

import pytest
from plugin_notification.audience import AudienceResolver
from plugin_notification.crud import MessageCRUD, OutboxCRUD, PreferenceCRUD, TemplateCRUD
from plugin_notification.models import (
    NotificationAudience,
    NotificationMessage,
    NotificationOutbox,
    UserNotification,
)
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference import PreferenceResolver
from rapidkit_common.protocols.notification import (
    AudienceRule,
    NotificationAction,
    NotificationCommand,
)
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_framework.exceptions import AppException
from sqlmodel import col, select


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
        audience_resolver=AudienceResolver(
            query_service=cast(UserQueryService, _QueryService())
        ),
        preference_resolver=PreferenceResolver(session=session),
    )


@pytest.mark.asyncio
async def test_orchestrator_writes_message_inbox_and_outbox(db_session):
    first_user_id, second_user_id = uuid4(), uuid4()
    orchestrator = _orchestrator(db_session, [first_user_id, second_user_id])
    command = NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="info",
        raw_title="维护",
        raw_content="今晚维护",
        audience=[AudienceRule(type="all")],
        action=NotificationAction(route="home", params={}),
    )

    result = await orchestrator.process(command)
    await db_session.commit()

    assert result.recipient_count == 2
    assert result.deduplicated is False

    messages = (await db_session.exec(select(NotificationMessage))).all()
    assert len(messages) == 1
    assert messages[0].content_mode == "raw"
    assert messages[0].status == "published"

    inbox = (await db_session.exec(select(UserNotification))).all()
    assert {row.user_id for row in inbox} == {first_user_id, second_user_id}

    outbox = await OutboxCRUD(db_session).get_all()
    assert len(outbox) == 2


@pytest.mark.asyncio
async def test_orchestrator_filters_only_new_fanout_and_preserves_historical_inbox(db_session):
    disabled_user_id, enabled_user_id = uuid4(), uuid4()
    orchestrator = _orchestrator(db_session, [disabled_user_id, enabled_user_id])
    historical = await orchestrator.process(
        NotificationCommand(
            source="user",
            category="user.invited",
            level="info",
            raw_title="Earlier invitation",
            raw_content="Already delivered",
            audience=[AudienceRule(type="all")],
        )
    )
    await db_session.commit()
    await PreferenceCRUD(db_session).create(
        {
            "user_id": disabled_user_id,
            "category": "user.invited",
            "enabled": False,
        }
    )
    await db_session.commit()

    current = await orchestrator.process(
        NotificationCommand(
            source="user",
            category="user.invited",
            level="info",
            raw_title="Current invitation",
            raw_content="New delivery",
            audience=[AudienceRule(type="all")],
        )
    )
    await db_session.commit()

    historical_inbox = (
        await db_session.exec(
            select(UserNotification).where(
                col(UserNotification.message_id) == historical.message_id,
                col(UserNotification.user_id) == disabled_user_id,
            )
        )
    ).all()
    current_inbox = (
        await db_session.exec(
            select(UserNotification).where(col(UserNotification.message_id) == current.message_id)
        )
    ).all()
    current_outbox = (
        await db_session.exec(
            select(NotificationOutbox).where(col(NotificationOutbox.message_id) == current.message_id)
        )
    ).all()

    assert current.recipient_count == 1
    assert {row.user_id for row in current_inbox} == {enabled_user_id}
    assert {row.user_id for row in current_outbox} == {enabled_user_id}
    assert len(historical_inbox) == 1


@pytest.mark.asyncio
async def test_orchestrator_mandatory_message_fans_out_to_disabled_user(db_session):
    disabled_user_id, enabled_user_id = uuid4(), uuid4()
    await PreferenceCRUD(db_session).create(
        {
            "user_id": disabled_user_id,
            "category": "user.invited",
            "enabled": False,
        }
    )
    await db_session.commit()
    orchestrator = _orchestrator(db_session, [disabled_user_id, enabled_user_id])

    result = await orchestrator.process(
        NotificationCommand(
            source="system",
            category="user.invited",
            level="warning",
            raw_title="Mandatory notice",
            raw_content="Cannot be disabled",
            audience=[AudienceRule(type="all")],
            mandatory=True,
        )
    )
    await db_session.commit()

    inbox = (
        await db_session.exec(
            select(UserNotification).where(col(UserNotification.message_id) == result.message_id)
        )
    ).all()
    outbox = (
        await db_session.exec(
            select(NotificationOutbox).where(col(NotificationOutbox.message_id) == result.message_id)
        )
    ).all()
    assert result.recipient_count == 2
    assert {row.user_id for row in inbox} == {disabled_user_id, enabled_user_id}
    assert {row.user_id for row in outbox} == {disabled_user_id, enabled_user_id}


@pytest.mark.asyncio
async def test_orchestrator_dedup_returns_existing_recipient_count(db_session):
    user_id = uuid4()
    orchestrator = _orchestrator(db_session, [user_id])
    command = NotificationCommand(
        source="user",
        category="user.invited",
        level="info",
        i18n_key="notification.user.invited",
        i18n_params={"username": "alice"},
        audience=[AudienceRule(type="all")],
        deduplication_key="invite-123",
    )

    first_result = await orchestrator.process(command)
    await db_session.commit()
    deduplicated_result = await orchestrator.process(command)
    await db_session.commit()

    assert deduplicated_result.message_id == first_result.message_id
    assert deduplicated_result.recipient_count == 1
    assert deduplicated_result.deduplicated is True
    messages = (await db_session.exec(select(NotificationMessage))).all()
    assert len(messages) == 1
    inbox = await db_session.exec(
        select(UserNotification).where(col(UserNotification.message_id) == first_result.message_id)
    )
    assert len(inbox.all()) == 1


@pytest.mark.asyncio
async def test_orchestrator_recovers_stale_dedup_conflict_without_rolling_back_outer_writes(
    db_session, monkeypatch
):
    user_id = uuid4()
    orchestrator = _orchestrator(db_session, [user_id])
    command = NotificationCommand(
        source="user",
        category="user.invited",
        level="info",
        i18n_key="notification.user.invited",
        audience=[AudienceRule(type="all")],
        deduplication_key="concurrent-invite",
    )
    winner = await orchestrator.process(command)
    await db_session.commit()

    unrelated_write = NotificationAudience(
        message_id=uuid4(),
        audience_type="user",
        audience_value=str(uuid4()),
    )
    db_session.add(unrelated_write)
    await db_session.flush()

    original_get = MessageCRUD.get_by_source_dedup
    stale_precheck = True

    async def get_after_stale_precheck(self, source, dedup_key):
        nonlocal stale_precheck
        if stale_precheck:
            stale_precheck = False
            return None
        return await original_get(self, source, dedup_key)

    monkeypatch.setattr(MessageCRUD, "get_by_source_dedup", get_after_stale_precheck)

    result = await orchestrator.process(command)
    await db_session.commit()

    assert result.message_id == winner.message_id
    assert result.recipient_count == 1
    assert result.deduplicated is True
    assert await db_session.get(NotificationAudience, unrelated_write.id) is not None


@pytest.mark.asyncio
async def test_orchestrator_empty_audience_raises(db_session):
    orchestrator = _orchestrator(db_session, [])
    command = NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="info",
        raw_title="x",
        raw_content="y",
        audience=[AudienceRule(type="all")],
    )

    with pytest.raises(AppException):
        await orchestrator.process(command)


@pytest.mark.asyncio
async def test_orchestrator_process_renders_template_content_before_immediate_fanout(db_session):
    await TemplateCRUD(db_session).create(
        {
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
    )
    user_id = uuid4()
    orchestrator = _orchestrator(db_session, [user_id])
    command = NotificationCommand(
        source="user",
        category="user.invited",
        level="info",
        template_code="user.invited",
        template_variables={"username": "alice"},
        audience=[AudienceRule(type="all")],
    )

    result = await orchestrator.process(command)
    await db_session.commit()

    message = await MessageCRUD(db_session).get(result.message_id)
    assert message is not None
    assert message.content_mode == "raw"
    assert message.title == "Invite alice"
    assert message.content == "Welcome alice"
    assert message.template_id is not None
