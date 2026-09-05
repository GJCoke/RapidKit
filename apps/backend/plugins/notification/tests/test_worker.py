"""DeliveryWorker 测试。"""

from uuid import uuid4

import pytest
from plugin_notification.channels import ChannelRegistry, ChannelResult
from plugin_notification.crud import MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.enums import BASE_BACKOFF_SECONDS, MAX_ATTEMPTS, OutboxStatus
from plugin_notification.models import NotificationOutbox, UserNotification
from plugin_notification.worker import DeliveryWorker
from sqlmodel import col, select


class _FakeRedis:
    async def get(self, key):
        return None


class _OKChannel:
    async def deliver(self, *, redis, user_id, payload):
        return ChannelResult(success=True)


class _FailChannel:
    async def deliver(self, *, redis, user_id, payload):
        return ChannelResult(success=False, error_code="boom")


async def _seed_message_and_outbox(
    session,
    *,
    status=OutboxStatus.PENDING.value,
    attempts=0,
    channel="in_app",
    next_attempt_at=None,
):
    user_id = uuid4()
    message = await MessageCRUD(session).create(
        {
            "source": "admin",
            "category": "c",
            "level": "info",
            "content_mode": "raw",
            "title": "t",
            "content": "b",
            "content_params": None,
            "content_format": "plain_text",
            "mandatory": False,
            "channels": [channel],
            "action": None,
            "meta": None,
            "status": "published",
            "deduplication_key": None,
            "correlation_id": uuid4().hex,
        }
    )
    inbox = await UserNotificationCRUD(session).create(
        {"message_id": message.id, "user_id": user_id}
    )
    outbox = await OutboxCRUD(session).create(
        {
            "message_id": message.id,
            "user_id": user_id,
            "channel": channel,
            "status": status,
            "idempotency_key": f"{message.id}:{user_id}:{channel}",
            "attempt_count": attempts,
            "next_attempt_at": next_attempt_at,
        }
    )
    await session.commit()
    return message, inbox, outbox


def _worker(session, channel, *, batch_size=100):
    registry = ChannelRegistry()
    registry.register("in_app", channel)
    return DeliveryWorker(
        session=session,
        redis=_FakeRedis(),
        registry=registry,
        worker_id="w1",
        batch_size=batch_size,
    )


@pytest.mark.asyncio
async def test_deliver_success_marks_sent_and_inbox_delivered(db_session):
    _, inbox, outbox = await _seed_message_and_outbox(db_session)

    processed = await _worker(db_session, _OKChannel()).run_once()
    await db_session.commit()

    refreshed = await OutboxCRUD(db_session).get(outbox.id)
    refreshed_inbox = await UserNotificationCRUD(db_session).get(inbox.id)
    assert processed == 1
    assert refreshed.status == OutboxStatus.SENT.value
    assert refreshed.attempt_count == 1
    assert refreshed.sent_at is not None
    assert refreshed.locked_by is None
    assert refreshed.locked_until is None
    assert refreshed_inbox.delivered_at is not None


@pytest.mark.asyncio
async def test_deliver_failure_retries_with_exponential_backoff(db_session):
    _, _, outbox = await _seed_message_and_outbox(db_session, attempts=1)

    await _worker(db_session, _FailChannel()).run_once()
    await db_session.commit()

    refreshed = await OutboxCRUD(db_session).get(outbox.id)
    assert refreshed.status == OutboxStatus.RETRYING.value
    assert refreshed.attempt_count == 2
    assert refreshed.last_error_code == "boom"
    assert refreshed.next_attempt_at is not None
    expected_backoff = BASE_BACKOFF_SECONDS * 2
    actual_backoff = (refreshed.next_attempt_at - refreshed.update_time).total_seconds()
    assert expected_backoff - 1 <= actual_backoff <= expected_backoff + 1
    assert refreshed.locked_by is None
    assert refreshed.locked_until is None


@pytest.mark.asyncio
async def test_deliver_failure_dead_after_max(db_session):
    _, _, outbox = await _seed_message_and_outbox(db_session, attempts=MAX_ATTEMPTS - 1)

    await _worker(db_session, _FailChannel()).run_once()
    await db_session.commit()

    refreshed = await OutboxCRUD(db_session).get(outbox.id)
    assert refreshed.status == OutboxStatus.DEAD.value
    assert refreshed.attempt_count == MAX_ATTEMPTS
    assert refreshed.locked_by is None
    assert refreshed.locked_until is None


@pytest.mark.asyncio
async def test_unknown_channel_is_processed_dead_and_unlocked(db_session):
    _, _, outbox = await _seed_message_and_outbox(db_session, channel="email")

    processed = await _worker(db_session, _OKChannel()).run_once()
    await db_session.commit()

    refreshed = await OutboxCRUD(db_session).get(outbox.id)
    assert processed == 1
    assert refreshed.status == OutboxStatus.DEAD.value
    assert refreshed.last_error_code == "unknown_channel"
    assert refreshed.locked_by is None
    assert refreshed.locked_until is None


@pytest.mark.asyncio
async def test_claim_respects_batch_size(db_session):
    await _seed_message_and_outbox(db_session)
    await _seed_message_and_outbox(db_session)

    processed = await _worker(db_session, _OKChannel(), batch_size=1).run_once()
    await db_session.commit()

    rows = (await db_session.exec(select(NotificationOutbox))).all()
    assert processed == 1
    assert sum(row.status == OutboxStatus.SENT.value for row in rows) == 1
    assert sum(row.status == OutboxStatus.PENDING.value for row in rows) == 1


@pytest.mark.asyncio
async def test_success_marks_only_matching_inbox_delivered(db_session):
    message, inbox, _ = await _seed_message_and_outbox(db_session)
    other_inbox = await UserNotificationCRUD(db_session).create(
        {"message_id": message.id, "user_id": uuid4()}
    )
    await db_session.commit()

    await _worker(db_session, _OKChannel()).run_once()
    await db_session.commit()

    delivered = await db_session.exec(
        select(UserNotification).where(col(UserNotification.id) == inbox.id)
    )
    untouched = await UserNotificationCRUD(db_session).get(other_inbox.id)
    assert delivered.one().delivered_at is not None
    assert untouched.delivered_at is None
