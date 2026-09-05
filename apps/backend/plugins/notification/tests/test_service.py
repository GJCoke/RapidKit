"""Notification command contract tests."""

from uuid import uuid4

import pytest
from plugin_notification.models import NotificationMessage
from plugin_notification.service import NotificationService
from rapidkit_common.protocols.notification import (
    AudienceRule,
    NotificationAction,
    NotificationCommand,
)
from sqlmodel import select


class _StubQueryService:
    def __init__(self, all_user_ids):
        self._all_user_ids = all_user_ids

    async def get_users_by_role(self, role_code):
        return []

    async def get_users_by_department(self, department_id):
        return []

    async def get_all_active_user_ids(self):
        return list(self._all_user_ids)


class _SessionContext:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False


def test_command_i18n_mode_defaults_to_in_app_channel():
    command = NotificationCommand(
        source="user",
        category="user.invited",
        level="info",
        i18n_key="notification.user.invited",
        i18n_params={"username": "alice"},
        audience=[AudienceRule(type="user", value="018f-user-uuid")],
        action=NotificationAction(route="user-detail", params={"id": "018f-user-uuid"}),
    )

    assert command.content_mode == "i18n"
    assert command.channels == ["in_app"]


def test_command_accepts_complete_raw_content():
    command = NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="warning",
        raw_title="系统维护通知",
        raw_content="今晚 22:00 停机维护。",
        raw_format="plain_text",
        audience=[AudienceRule(type="all")],
    )

    assert command.content_mode == "raw"


def test_command_rejects_both_content_sources():
    with pytest.raises(ValueError):
        NotificationCommand(
            source="x",
            category="c",
            level="info",
            i18n_key="a.b",
            raw_title="t",
            raw_content="c",
            audience=[AudienceRule(type="all")],
        )


def test_command_rejects_missing_content_source():
    with pytest.raises(ValueError):
        NotificationCommand(
            source="x",
            category="c",
            level="info",
            audience=[AudienceRule(type="all")],
        )


def test_command_rejects_empty_audience():
    with pytest.raises(ValueError):
        NotificationCommand(
            source="x",
            category="c",
            level="info",
            raw_title="t",
            raw_content="c",
            audience=[],
        )


@pytest.mark.asyncio
async def test_service_send_commits_then_signals_delivery(db_session):
    enqueued = {"called": False, "after_commit": False}

    def fake_enqueue():
        enqueued["called"] = True
        enqueued["after_commit"] = not db_session.in_transaction()

    service = NotificationService(
        session_factory=lambda: _SessionContext(db_session),
        query_service=_StubQueryService([uuid4()]),
        enqueue_delivery=fake_enqueue,
    )
    command = NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="info",
        raw_title="hi",
        raw_content="body",
        audience=[AudienceRule(type="all")],
    )

    result = await service.send(command)

    assert result.recipient_count == 1
    messages = (await db_session.exec(select(NotificationMessage))).all()
    assert len(messages) == 1
    assert enqueued == {"called": True, "after_commit": True}
