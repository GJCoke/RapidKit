"""Persisted announcement text survives publishing and recipient presentation APIs."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import cast
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_notification.admin_api import _to_command, router
from plugin_notification.admin_deps import get_admin_service, get_message_crud
from plugin_notification.admin_schemas import AnnouncementCreateRequest
from plugin_notification.admin_service import AdminNotificationService
from plugin_notification.api import get_unread_count, list_notifications, mark_read
from plugin_notification.channels import ChannelRegistry
from plugin_notification.crud import MessageCRUD, UserNotificationCRUD
from plugin_notification.models import NotificationMessage, NotificationOutbox, NotificationTemplate, UserNotification
from plugin_notification.schemas import InboxListQuery
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.worker import DeliveryWorker
from rapidkit_common.access import access_guard_dependency
from rapidkit_common.access_testing import allow_access
from rapidkit_common.auth import _get_current_user_placeholder
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_framework.exceptions import AppException
from sqlmodel import select


class _Recipients:
    def __init__(self, user_id):
        self.user_id = user_id

    async def get_all_active_user_ids(self):
        return [self.user_id]

    async def get_active_user_ids(self, user_ids):
        return [user_id for user_id in user_ids if user_id == self.user_id]


@pytest.fixture
def context(db_session):
    user = SimpleNamespace(id=uuid4(), is_admin=True, roles=[], department_id=None)

    @asynccontextmanager
    async def session_factory():
        try:
            yield db_session
        except Exception:
            await db_session.rollback()
            raise

    enqueue = Mock()
    service = AdminNotificationService(
        session_factory=session_factory,
        query_service=cast(UserQueryService, _Recipients(user.id)),
        enqueue_delivery=enqueue,
    )
    return user, service, enqueue


@pytest.mark.asyncio
@pytest.mark.parametrize("character", [None, "中", "😀"], ids=["ordinary", "long-chinese", "long-emoji"])
async def test_draft_publish_inbox_and_read_preserve_complete_text(db_session, context, character):
    user, service, _ = context
    title = "维护通知" if character is None else character * 256
    content = "今晚维护\n请提前保存工作。" if character is None else "开始标记\n" + character * 19_990 + "\n结束标记"
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[access_guard_dependency] = allow_access(user)
    app.dependency_overrides[_get_current_user_placeholder] = lambda: user
    app.dependency_overrides[get_admin_service] = lambda: service
    app.dependency_overrides[get_message_crud] = lambda: MessageCRUD(db_session)
    payload = {"rawTitle": title, "rawContent": content, "audience": [{"type": "all"}], "saveAsDraft": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post("/admin/notifications", json=payload)
        assert created.status_code == 200
        message_id = UUID(created.json()["data"]["messageId"])
        db_session.expunge_all()
        draft = await client.get(f"/admin/notifications/{message_id}")
        assert draft.json()["data"]["title"] == title
        assert draft.json()["data"]["content"] == content
        assert (await db_session.exec(select(UserNotification))).all() == []

        published = await client.post(f"/admin/notifications/{message_id}/publish")
        assert published.status_code == 200
        assert published.json()["data"]["recipientCount"] == 1

    db_session.expunge_all()
    crud = UserNotificationCRUD(db_session)
    inbox = await list_notifications(query=InboxListQuery(), user=user, crud=crud)
    assert len(inbox.data.items) == 1
    item = inbox.data.items[0]
    assert item.title == title
    assert item.content == content
    assert item.read_at is None
    assert (await get_unread_count(user=user, crud=crud)).data.count == 1
    worker = DeliveryWorker(session=db_session, redis=None, registry=ChannelRegistry(), worker_id="content-test")
    pushed = await worker._build_payload(message_id, user.id)
    assert pushed["title"] == title
    assert pushed["content"] == content

    await mark_read(notification_id=item.id, user=user, crud=crud)
    await db_session.commit()
    db_session.expunge_all()
    assert (await get_unread_count(user=user, crud=crud)).data.count == 0
    read = (await list_notifications(query=InboxListQuery(), user=user, crud=crud)).data.items[0]
    assert read.read_at is not None
    assert read.content == content


@pytest.mark.asyncio
@pytest.mark.parametrize("overflow", ["raw-body", "rendered-template-title"])
async def test_overflow_rejected_without_partial_message_or_delivery_rows(db_session, context, overflow):
    user, service, enqueue = context
    if overflow == "raw-body":
        body = AnnouncementCreateRequest(raw_title="Title", raw_content="中" * 20_001, audience=[{"type": "all"}])
    else:
        db_session.add(
            NotificationTemplate(
                code="overflow",
                name="Overflow regression",
                category="admin.announcement",
                content_mode="raw",
                title_template="Notice {name}",
                content_template="Body",
                variable_schema={"name": {"type": "string", "required": True}},
                enabled=True,
            )
        )
        await db_session.commit()
        body = AnnouncementCreateRequest(
            template_code="overflow", template_variables={"name": "x" * 250}, audience=[{"type": "all"}]
        )

    with pytest.raises(AppException) as exc:
        await service.create_message(_to_command(body), created_by=user.id)
    assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND
    for model in (NotificationMessage, UserNotification, NotificationOutbox):
        assert (await db_session.exec(select(model))).all() == []
    enqueue.assert_not_called()
