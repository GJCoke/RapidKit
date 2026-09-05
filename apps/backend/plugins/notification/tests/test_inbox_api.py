"""收件箱 API 行为测试（端点函数级）。"""

from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

import pytest
from plugin_notification.api import (
    archive_notification,
    delete_notification,
    get_notification,
    get_unread_count,
    list_notifications,
    mark_all_read,
    mark_read,
)
from plugin_notification.crud import MessageCRUD, UserNotificationCRUD
from plugin_notification.schemas import InboxListQuery
from plugin_notification.status_codes import NotificationStatusCode
from rapidkit_framework.exceptions import AppException


class _CurrentUser:
    def __init__(self, user_id: UUID) -> None:
        self.id = user_id
        self.is_admin = False


async def _seed(db_session, user_id: UUID, count: int = 3):
    messages = []
    crud = UserNotificationCRUD(db_session)
    rows = []
    for _ in range(count):
        message = await MessageCRUD(db_session).create(
            {
                "source": "admin",
                "category": "system",
                "level": "info",
                "content_mode": "raw",
                "title": "Test title",
                "content": "Test body",
                "content_params": None,
                "content_format": "plain_text",
                "mandatory": False,
                "channels": ["in_app"],
                "action": None,
                "meta": None,
                "status": "published",
                "deduplication_key": None,
                "correlation_id": str(uuid4()),
            }
        )
        messages.append(message)
        rows.append(await crud.create({"message_id": message.id, "user_id": user_id}))
    await db_session.commit()
    return messages[0], rows


@pytest.mark.asyncio
async def test_unread_count_is_limited_to_current_user(db_session):
    user_id = uuid4()
    other_user_id = uuid4()
    await _seed(db_session, user_id, count=2)
    await _seed(db_session, other_user_id, count=1)

    response = await get_unread_count(user=_CurrentUser(user_id), crud=UserNotificationCRUD(db_session))

    assert response.data is not None
    assert response.data.count == 2


@pytest.mark.asyncio
async def test_list_returns_only_current_users_notifications(db_session):
    user_id = uuid4()
    other_user_id = uuid4()
    await _seed(db_session, user_id, count=2)
    await _seed(db_session, other_user_id, count=1)

    response = await list_notifications(
        query=InboxListQuery(),
        user=_CurrentUser(user_id),
        crud=UserNotificationCRUD(db_session),
    )

    assert response.data is not None
    assert len(response.data.items) == 2
    assert {item.title for item in response.data.items} == {"Test title"}


@pytest.mark.asyncio
async def test_detail_returns_current_users_notification(db_session):
    user_id = uuid4()
    message, rows = await _seed(db_session, user_id, count=1)

    response = await get_notification(
        notification_id=rows[0].id,
        user=_CurrentUser(user_id),
        crud=UserNotificationCRUD(db_session),
    )

    assert response.data is not None
    assert response.data.id == rows[0].id
    assert response.data.message_id == message.id
    assert response.data.content == "Test body"


@pytest.mark.asyncio
async def test_mark_read_sets_read_timestamp(db_session):
    user_id = uuid4()
    _, rows = await _seed(db_session, user_id, count=1)
    crud = UserNotificationCRUD(db_session)

    await mark_read(notification_id=rows[0].id, user=_CurrentUser(user_id), crud=crud)
    await db_session.commit()

    row = await crud.get(rows[0].id)
    assert row is not None
    assert row.read_at is not None


@pytest.mark.asyncio
async def test_mark_all_read_updates_only_current_users_notifications(db_session):
    user_id = uuid4()
    other_user_id = uuid4()
    await _seed(db_session, user_id, count=3)
    await _seed(db_session, other_user_id, count=1)
    crud = UserNotificationCRUD(db_session)

    await mark_all_read(user=_CurrentUser(user_id), crud=crud)
    await db_session.commit()

    assert await crud.get_unread_count(user_id) == 0
    assert await crud.get_unread_count(other_user_id) == 1


@pytest.mark.asyncio
async def test_archive_sets_archive_timestamp(db_session):
    user_id = uuid4()
    _, rows = await _seed(db_session, user_id, count=1)
    crud = UserNotificationCRUD(db_session)

    await archive_notification(notification_id=rows[0].id, user=_CurrentUser(user_id), crud=crud)
    await db_session.commit()

    row = await crud.get(rows[0].id)
    assert row is not None
    assert row.archived_at is not None


@pytest.mark.asyncio
async def test_delete_soft_deletes_notification(db_session):
    user_id = uuid4()
    _, rows = await _seed(db_session, user_id, count=1)
    crud = UserNotificationCRUD(db_session)

    await delete_notification(notification_id=rows[0].id, user=_CurrentUser(user_id), crud=crud)
    await db_session.commit()

    row = await crud.get(rows[0].id)
    assert row is not None
    assert row.deleted_at is not None


InboxMutation = Callable[..., Awaitable[object]]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "endpoint",
    [get_notification, mark_read, archive_notification, delete_notification],
    ids=["detail", "mark-read", "archive", "delete"],
)
async def test_notification_id_endpoints_hide_foreign_notifications(
    db_session,
    endpoint: InboxMutation,
):
    user_id = uuid4()
    other_user_id = uuid4()
    _, rows = await _seed(db_session, other_user_id, count=1)
    crud = UserNotificationCRUD(db_session)

    with pytest.raises(AppException) as exc_info:
        await endpoint(notification_id=rows[0].id, user=_CurrentUser(user_id), crud=crud)

    assert exc_info.value.status_code_enum is NotificationStatusCode.NOTIFICATION_NOT_FOUND
    row = await crud.get(rows[0].id)
    assert row is not None
    assert row.read_at is None
    assert row.archived_at is None
    assert row.deleted_at is None
