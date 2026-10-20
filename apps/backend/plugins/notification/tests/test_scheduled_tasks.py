"""Scheduled publication and expiration task tests."""

from datetime import timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from plugin_notification.audience import AudienceResolver
from plugin_notification.crud import MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.models import NotificationOutbox, UserNotification
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference.services import PreferenceResolver
from plugin_notification.tasks import (
    _expire_due,
    _publish_due,
    expire_notifications,
    publish_scheduled_notifications,
)
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.timezone import timezone
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession


def _orchestrator(session: AsyncSession, audience_ids: list[UUID]) -> MessageOrchestrator:
    class _QueryService:
        async def get_active_user_ids(self, user_ids: list[UUID]) -> list[UUID]:
            return list(user_ids)

        async def get_active_user_ids_by_role(self, role_code: str) -> list:
            return []

        async def get_active_user_ids_by_department(
            self, department_id: UUID, include_descendants: bool = False
        ) -> list:
            return []

        async def get_all_active_user_ids(self) -> list[UUID]:
            return list(audience_ids)

    return MessageOrchestrator(
        session=session,
        audience_resolver=AudienceResolver(query_service=cast(UserQueryService, _QueryService())),
        preference_resolver=PreferenceResolver(session=session),
    )


def _command() -> NotificationCommand:
    return NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="info",
        raw_title="Maintenance",
        raw_content="Maintenance tonight",
        audience=[AudienceRule(type="all")],
    )


@pytest.mark.asyncio
async def test_publish_due_publishes_only_scheduled_messages_that_are_due(db_session):
    user_id = uuid4()
    orchestrator = _orchestrator(db_session, [user_id])
    past = timezone.now() - timedelta(minutes=1)
    future = timezone.now() + timedelta(minutes=1)
    due_message = await orchestrator.create_message(
        _command(),
        created_by=uuid4(),
        publish_at=past,
    )
    future_message = await orchestrator.create_message(
        _command(),
        created_by=uuid4(),
        publish_at=future,
    )
    await db_session.commit()

    published = await _publish_due(db_session, orchestrator)
    await db_session.commit()

    refreshed_due = await MessageCRUD(db_session).get(due_message.id)
    refreshed_future = await MessageCRUD(db_session).get(future_message.id)
    assert published == 1
    assert refreshed_due is not None
    assert refreshed_due.status == MessageStatus.PUBLISHED.value
    assert refreshed_future is not None
    assert refreshed_future.status == MessageStatus.SCHEDULED.value
    assert len((await db_session.exec(select(UserNotification))).all()) == 1


@pytest.mark.asyncio
async def test_publish_due_rolls_back_one_failed_fanout_and_continues(db_session):
    first_user_id, second_user_id = uuid4(), uuid4()
    base_orchestrator = _orchestrator(db_session, [first_user_id, second_user_id])
    past = timezone.now() - timedelta(minutes=1)
    failed_message = await base_orchestrator.create_message(
        _command(),
        created_by=uuid4(),
        publish_at=past,
    )
    successful_message = await base_orchestrator.create_message(
        _command(),
        created_by=uuid4(),
        publish_at=past,
    )
    await db_session.commit()
    failed_message_id = failed_message.id
    successful_message_id = successful_message.id

    class _PartiallyFailingOrchestrator(MessageOrchestrator):
        async def _fanout(
            self,
            message,
            audience_rules,
        ) -> int:
            if message.id == failed_message_id:
                await UserNotificationCRUD(self.session).create({"message_id": message.id, "user_id": first_user_id})
                await OutboxCRUD(self.session).create(
                    {
                        "message_id": message.id,
                        "user_id": first_user_id,
                        "channel": "in_app",
                        "status": OutboxStatus.PENDING.value,
                        "idempotency_key": f"{message.id}:{first_user_id}:in_app",
                        "attempt_count": 0,
                        "next_attempt_at": timezone.now(),
                    }
                )
                raise RuntimeError("fanout failed after partial writes")
            return await super()._fanout(message, audience_rules)

    orchestrator = _PartiallyFailingOrchestrator(
        session=db_session,
        audience_resolver=base_orchestrator.audience,
        preference_resolver=base_orchestrator.preference,
    )

    published = await _publish_due(db_session, orchestrator)
    await db_session.commit()

    refreshed_failed = await MessageCRUD(db_session).get(failed_message_id)
    refreshed_successful = await MessageCRUD(db_session).get(successful_message_id)
    failed_inbox = await UserNotificationCRUD(db_session).get_all(col(UserNotification.message_id) == failed_message_id)
    failed_outbox = await OutboxCRUD(db_session).get_all(col(NotificationOutbox.message_id) == failed_message_id)
    successful_inbox = await UserNotificationCRUD(db_session).get_all(
        col(UserNotification.message_id) == successful_message_id
    )

    assert published == 1
    assert refreshed_failed is not None
    assert refreshed_failed.status == MessageStatus.SCHEDULED.value
    assert refreshed_failed.published_at is None
    assert failed_inbox == []
    assert failed_outbox == []
    assert refreshed_successful is not None
    assert refreshed_successful.status == MessageStatus.PUBLISHED.value
    assert len(successful_inbox) == 2


@pytest.mark.asyncio
async def test_expire_due_marks_only_published_messages_past_expiration(db_session):
    orchestrator = _orchestrator(db_session, [uuid4()])
    past = timezone.now() - timedelta(minutes=1)
    future = timezone.now() + timedelta(minutes=1)
    expired_message = await orchestrator.create_message(
        _command(),
        created_by=uuid4(),
        expire_at=past,
    )
    future_message = await orchestrator.create_message(
        _command(),
        created_by=uuid4(),
        expire_at=future,
    )
    await db_session.commit()
    await orchestrator.publish_message(expired_message.id)
    await orchestrator.publish_message(future_message.id)
    await db_session.commit()

    expired = await _expire_due(db_session)
    await db_session.commit()

    refreshed_expired = await MessageCRUD(db_session).get(expired_message.id)
    refreshed_future = await MessageCRUD(db_session).get(future_message.id)
    assert expired == 1
    assert refreshed_expired is not None
    assert refreshed_expired.status == MessageStatus.EXPIRED.value
    assert refreshed_future is not None
    assert refreshed_future.status == MessageStatus.PUBLISHED.value


class _FakeRedisLock:
    def __init__(self, acquired: bool) -> None:
        self.acquired = acquired
        self.released = False

    async def acquire(self) -> bool:
        return self.acquired

    async def release(self) -> None:
        self.released = True


class _FakeRedis:
    def __init__(self, acquired: bool) -> None:
        self.acquired = acquired
        self.lock_name: str | None = None
        self.timeout: int | None = None
        self.blocking: bool | None = None
        self.redis_lock: _FakeRedisLock | None = None

    def lock(
        self,
        name: str,
        *,
        timeout: int,
        blocking: bool,
    ) -> _FakeRedisLock:
        self.lock_name = name
        self.timeout = timeout
        self.blocking = blocking
        self.redis_lock = _FakeRedisLock(self.acquired)
        return self.redis_lock


class _UnusedSessionFactory:
    def __call__(self):
        raise AssertionError("database must not be opened without the distributed lock")


class _FailingSessionContext:
    async def __aenter__(self):
        raise RuntimeError("database unavailable")

    async def __aexit__(self, *exc_info: Any) -> bool:
        return False


class _FailingSessionFactory:
    def __call__(self) -> _FailingSessionContext:
        return _FailingSessionContext()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("task", "lock_name"),
    [
        (publish_scheduled_notifications, "lock:publish_scheduled_notifications"),
        (expire_notifications, "lock:expire_notifications"),
    ],
)
async def test_scheduled_task_does_not_open_database_when_lock_is_unavailable(
    task,
    lock_name,
):
    redis = _FakeRedis(acquired=False)

    await task.run(redis, _UnusedSessionFactory())

    assert redis.lock_name == lock_name
    assert redis.timeout == 60
    assert redis.blocking is False
    assert redis.redis_lock is not None
    assert redis.redis_lock.released is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "task",
    [publish_scheduled_notifications, expire_notifications],
)
async def test_scheduled_task_releases_lock_when_database_processing_fails(task):
    redis = _FakeRedis(acquired=True)

    with pytest.raises(RuntimeError, match="database unavailable"):
        await task.run(redis, _FailingSessionFactory())

    assert redis.redis_lock is not None
    assert redis.redis_lock.released is True
