"""Recalled inbox content stays private without rewriting audit or read state."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from plugin_notification.api import list_notifications, mark_all_read, mark_read
from plugin_notification.channels import ChannelRegistry, ChannelResult
from plugin_notification.crud import MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.models import NotificationMessage
from plugin_notification.schemas import InboxListQuery
from plugin_notification.worker import DeliveryWorker
from rapidkit_core.timezone import timezone
from sqlmodel import col, update


async def seed(session, user_id, *, status="recalled", content_mode="raw", snapshot=False, read_at=None):
    message = await MessageCRUD(session).create(
        dict(
            source="admin",
            category="system",
            level="error",
            content_mode=content_mode,
            title="Original title",
            content="Original body",
            content_params={"secret": "Original parameter"},
            content_format="plain_text",
            mandatory=True,
            action={"type": "route", "routeName": "private"},
            status=status,
            recalled_at=timezone.now() if status == "recalled" else None,
            correlation_id=uuid4().hex,
        )
    )
    row = await UserNotificationCRUD(session).create(
        dict(
            message_id=message.id,
            user_id=user_id,
            read_at=read_at,
            rendered_content=(
                dict(
                    content_mode=content_mode,
                    title="Personal title",
                    content="Personal body",
                    content_params={"secret": "Personal parameter"},
                    content_format="plain_text",
                )
                if snapshot
                else None
            ),
        )
    )
    await session.commit()
    return message, row


@pytest.mark.asyncio
@pytest.mark.parametrize("content_mode", ["raw", "i18n"])
@pytest.mark.parametrize("snapshot", [False, True], ids=["shared", "personalized"])
async def test_recalled_list_hides_content_and_preserves_originals(db_session, content_mode, snapshot):
    user = SimpleNamespace(id=uuid4())
    message, row = await seed(db_session, user.id, content_mode=content_mode, snapshot=snapshot)
    original_snapshot = row.rendered_content
    crud = UserNotificationCRUD(db_session)

    page = await list_notifications(InboxListQuery(), user, crud)

    for item in page.data.items:
        assert item.id == row.id
        assert item.message_id == message.id
        assert item.status == "recalled"
        assert item.recalled_at == message.recalled_at
        assert item.read_at is None
        assert item.content_mode == "raw"
        assert item.title == ""
        assert item.content == ""
        assert item.content_params is None
        assert item.action is None
        assert item.mandatory is False
    await db_session.refresh(message)
    await db_session.refresh(row)
    assert message.title == "Original title"
    assert message.content == "Original body"
    assert message.content_params == {"secret": "Original parameter"}
    assert message.action == {"type": "route", "routeName": "private"}
    assert message.mandatory is True
    assert row.rendered_content == original_snapshot


@pytest.mark.asyncio
async def test_unread_count_and_both_cursor_queries_exclude_recalled(db_session):
    user_id = uuid4()
    _, recalled = await seed(db_session, user_id)
    _, published = await seed(db_session, user_id, status="published")
    crud = UserNotificationCRUD(db_session)

    assert await crud.get_unread_count(user_id) == 1
    rows, _ = await crud.paginate_inbox(user_id, unread_only=True)
    assert [row.id for row in rows] == [published.id]
    items, _ = await crud.paginate_inbox_items(user_id, unread_only=True)
    assert [row.id for row, _ in items] == [published.id]
    all_items, _ = await crud.paginate_inbox_items(user_id)
    assert {row.id for row, _ in all_items} == {recalled.id, published.id}
    await db_session.refresh(recalled)
    assert recalled.read_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("already_read", [False, True])
async def test_mark_read_preserves_recalled_timestamp(db_session, already_read):
    user = SimpleNamespace(id=uuid4())
    original = timezone.now() if already_read else None
    _, recalled = await seed(db_session, user.id, read_at=original)

    await mark_read(recalled.id, user, UserNotificationCRUD(db_session))
    await db_session.refresh(recalled)

    assert recalled.read_at == original


@pytest.mark.asyncio
async def test_read_all_skips_recalled_and_keeps_existing_read_timestamp(db_session):
    user = SimpleNamespace(id=uuid4())
    _, recalled = await seed(db_session, user.id)
    original = timezone.now()
    _, read_recalled = await seed(db_session, user.id, read_at=original)
    _, published = await seed(db_session, user.id, status="published")

    await mark_all_read(user, UserNotificationCRUD(db_session))
    for row in (recalled, read_recalled, published):
        await db_session.refresh(row)

    assert recalled.read_at is None
    assert read_recalled.read_at == original
    assert published.read_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["published", "recalled", "expired"])
async def test_socket_payload_matches_http_recipient_projection(db_session, status):
    user = SimpleNamespace(id=uuid4())
    message, row = await seed(db_session, user.id, status=status, snapshot=True, read_at=timezone.now())
    row.archived_at = timezone.now()
    await db_session.flush()
    response = (
        await list_notifications(InboxListQuery(archived="all"), user, UserNotificationCRUD(db_session))
    ).data.items[0]

    payload = await DeliveryWorker(db_session, None, ChannelRegistry(), "test")._build_payload(message.id, user.id)

    assert payload == response.model_dump(mode="json", by_alias=True)
    assert payload["id"] == str(row.id)
    assert payload["messageId"] == str(message.id)
    assert payload["readAt"] is not None
    assert payload["archivedAt"] is not None


@pytest.mark.asyncio
async def test_worker_projection_refreshes_cached_message_after_recall(db_session):
    user_id = uuid4()
    message, _ = await seed(db_session, user_id, status="published", snapshot=True)
    await db_session.exec(
        update(NotificationMessage)
        .where(col(NotificationMessage.id) == message.id)
        .values(status="recalled", recalled_at=timezone.now())
        .execution_options(synchronize_session=False)
    )
    assert message.status == "published"

    payload = await DeliveryWorker(db_session, None, ChannelRegistry(), "test")._build_payload(message.id, user_id)

    assert payload["status"] == "recalled"
    assert payload["title"] == ""
    assert payload["content"] == ""
    assert payload["contentParams"] is None
    assert payload["action"] is None
    assert payload["mandatory"] is False


@pytest.mark.asyncio
async def test_worker_does_not_deliver_when_message_is_recalled_during_payload_build(db_session, monkeypatch):
    user_id = uuid4()
    message, _ = await seed(db_session, user_id, status="published")
    outbox = await OutboxCRUD(db_session).create(
        dict(message_id=message.id, user_id=user_id, channel="in_app", idempotency_key=uuid4().hex)
    )
    delivered = []

    class Channel:
        async def deliver(self, *, redis, user_id, payload):
            delivered.append(payload)
            return ChannelResult(success=True)

    registry = ChannelRegistry()
    registry.register("in_app", Channel())
    worker = DeliveryWorker(db_session, None, registry, "test")
    build = worker._build_payload

    async def recall_then_build(message_id, recipient_id):
        await db_session.exec(
            update(NotificationMessage)
            .where(col(NotificationMessage.id) == message_id)
            .values(status="recalled", recalled_at=timezone.now())
            .execution_options(synchronize_session=False)
        )
        return await build(message_id, recipient_id)

    monkeypatch.setattr(worker, "_build_payload", recall_then_build)
    assert await worker.run_once() == 1
    assert delivered == []
    assert outbox.status == "cancelled"


@pytest.mark.asyncio
async def test_worker_does_not_build_payload_for_missing_recipient_inbox(db_session):
    message, _ = await seed(db_session, uuid4(), status="published")

    payload = await DeliveryWorker(db_session, None, ChannelRegistry(), "test")._build_payload(message.id, uuid4())

    assert payload == {}
