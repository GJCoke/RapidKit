"""Business diagnostics use real JSON output and preserve delivery state transitions."""

import io
import json
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_auth.auth import services as auth
from plugin_notification.channels import ChannelRegistry, ChannelResult, InAppChannel
from plugin_notification.crud import MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.enums import MAX_ATTEMPTS, OutboxStatus
from plugin_notification.worker import DeliveryWorker
from rapidkit_core import log
from rapidkit_core.nanoid import request_id_scope
from rapidkit_framework.exceptions import AppException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest.fixture
def output():
    stream = io.StringIO()
    handler = log.logger.add(partial(log.json_sink, stream=stream), level="DEBUG")
    try:
        yield stream
    finally:
        log.logger.remove(handler)


def records(output):
    return [json.loads(line) for line in output.getvalue().splitlines()]


@pytest_asyncio.fixture
async def database():
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False}, poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def seed(session, attempts=0, channel="in_app"):
    message = await MessageCRUD(session).create(
        {
            "source": "admin",
            "category": "c",
            "level": "info",
            "content_mode": "raw",
            "title": "private-title",
            "content": "private-content",
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
    user_id = uuid4()
    await UserNotificationCRUD(session).create({"message_id": message.id, "user_id": user_id})
    outbox = await OutboxCRUD(session).create(
        {
            "message_id": message.id,
            "user_id": user_id,
            "channel": channel,
            "status": OutboxStatus.PENDING.value,
            "idempotency_key": str(uuid4()),
            "attempt_count": attempts,
        }
    )
    await session.commit()
    return message, outbox


@pytest.mark.parametrize(
    "success,attempts,expected",
    [(True, 0, "sent"), (False, 0, "retrying"), (False, MAX_ATTEMPTS - 1, "dead"), (True, 2, "sent")],
)
async def test_delivery_json_outcomes_and_request_task_context(database, output, success, attempts, expected):
    message, row = await seed(database, attempts)
    registry = ChannelRegistry()
    registry.register(
        "in_app", SimpleNamespace(deliver=AsyncMock(return_value=ChannelResult(success, "private-error-code")))
    )
    worker = DeliveryWorker(database, None, registry, "test-worker", jitter=lambda _low, _high: 0)
    with (
        request_id_scope("r" * 21),
        log.logger.contextualize(task_id="safe-task", task_name="deliver_pending_notifications"),
    ):
        assert await worker.run_once() == 1
        await database.commit()
    assert row.status == expected and row.attempt_count == attempts + 1
    rows = [r for r in records(output) if r.get("event", "").startswith("notification.delivery.")]
    summary = next(r for r in rows if r["event"] == "notification.delivery.batch.attempted")
    assert summary["processed_count"] == 1
    assert summary[expected + "_count"] == 1
    assert summary["request_id"] == "r" * 21 and summary["task_id"] == "safe-task"
    if expected != "sent" or attempts:
        event = "recovered" if success else expected
        attempt = next(r for r in rows if r["event"] == "notification.delivery." + event)
        assert attempt["message_id"] == str(message.id) and attempt["outbox_id"] == str(row.id)
        assert attempt["attempt"] == attempts + 1
        assert attempt["outcome"] == expected
    else:
        assert not any(r["level"] == "INFO" for r in rows)
    assert "private-" not in output.getvalue()


async def test_unknown_channel_and_cancelled_rows_have_batch_outcomes(database, output):
    _, unknown = await seed(database, channel="private-channel")
    message, cancelled = await seed(database)
    message.status = "recalled"
    database.add(message)
    await database.commit()
    worker = DeliveryWorker(database, None, ChannelRegistry(), "test-worker")
    assert await worker.run_once() == 2
    await database.commit()
    assert unknown.status == "dead" and cancelled.status == "cancelled"
    rows = records(output)
    dead = next(r for r in rows if r.get("event") == "notification.delivery.dead")
    assert dead["reason_code"] == "unknown_channel" and dead["attempt"] == 0
    summary = next(r for r in rows if r.get("event") == "notification.delivery.batch.attempted")
    assert summary["dead_count"] == 1 and summary["cancelled_count"] == 1 and summary["processed_count"] == 2
    assert "private-" not in output.getvalue()


async def test_failed_delivery_then_recovery_keeps_one_outbox_identity(database, output):
    _, row = await seed(database)
    adapter = SimpleNamespace(
        deliver=AsyncMock(side_effect=[ChannelResult(False, "inapp_emit_failed"), ChannelResult(True)])
    )
    registry = ChannelRegistry()
    registry.register("in_app", adapter)
    worker = DeliveryWorker(database, None, registry, "test-worker", jitter=lambda _low, _high: 0)
    await worker.run_once()
    row.next_attempt_at = None
    database.add(row)
    await database.commit()
    await worker.run_once()
    await database.commit()
    rows = [
        r
        for r in records(output)
        if r.get("event") in {"notification.delivery.retrying", "notification.delivery.recovered"}
    ]
    assert [r["attempt"] for r in rows] == [1, 2]
    assert {r["outbox_id"] for r in rows} == {str(row.id)}
    assert row.status == "sent"


async def test_channel_failure_never_logs_external_exception_value(output):
    channel = InAppChannel(lambda: SimpleNamespace(emit=AsyncMock(side_effect=RuntimeError("private-credential"))))
    result = await channel.deliver(redis=None, user_id=uuid4(), payload={"token": "private-payload"})
    assert not result.success
    row = next(r for r in records(output) if r.get("event") == "notification.channel.failed")
    assert row["exception_type"] == "RuntimeError" and row["reason_code"] == "inapp_emit_failed"
    assert "private-" not in output.getvalue()


async def test_refresh_token_has_fixed_success_replay_and_missing_events(output, monkeypatch):
    user = SimpleNamespace(id=uuid4(), username="private-user", roles=["private-role"])
    cache = SimpleNamespace(build=AsyncMock())
    monkeypatch.setattr(auth, "get_service", lambda _protocol: cache)
    store = SimpleNamespace(
        is_valid=AsyncMock(return_value=True),
        rotate=AsyncMock(return_value="private-token"),
        is_replay=AsyncMock(return_value=True),
        force_relogin=AsyncMock(),
    )
    assert await auth.refresh_user_token(uuid4(), user, store, None, "private-agent") == "private-token"
    store.is_valid.return_value = False
    with pytest.raises(AppException):
        await auth.refresh_user_token(uuid4(), user, store, None, "private-agent")
    store.is_replay.return_value = False
    with pytest.raises(AppException):
        await auth.refresh_user_token(uuid4(), user, store, None, "private-agent")
    rows = [r for r in records(output) if r.get("event") == "auth.token.refresh"]
    assert [r["outcome"] for r in rows] == ["success", "rejected", "rejected"]
    assert [r.get("reason_code") for r in rows[1:]] == ["token_replay", "token_missing"]
    assert "private-" not in output.getvalue()


def test_password_decryption_failure_is_fixed_and_value_free(output, monkeypatch):
    def fail(*_args):
        raise ValueError("private-decryption-value")

    monkeypatch.setattr(auth, "decrypt_message", fail)
    with pytest.raises(AppException):
        auth.decrypt_password("private-password")
    row = next(r for r in records(output) if r.get("event") == "auth.login.rejected")
    assert row["reason_code"] == "password_decrypt_failed" and row["exception_type"] == "ValueError"
    assert "private-" not in output.getvalue()


async def test_scheduled_publication_failure_and_recovery_use_message_id(database, output, monkeypatch):
    from plugin_notification import tasks

    message_id = uuid4()
    crud = SimpleNamespace(get_due_scheduled=AsyncMock(return_value=[SimpleNamespace(id=message_id)]))
    monkeypatch.setattr(tasks, "MessageCRUD", lambda _session: crud)
    orchestrator = SimpleNamespace(publish_message=AsyncMock(side_effect=RuntimeError("private-publication-error")))
    assert await tasks._publish_due(database, orchestrator) == 0
    orchestrator.publish_message.side_effect = None
    assert await tasks._publish_due(database, orchestrator) == 1
    rows = [r for r in records(output) if r.get("event", "").startswith("notification.publication.")]
    assert [r["outcome"] for r in rows] == ["failure", "success"]
    assert {r["message_id"] for r in rows} == {str(message_id)}
    assert rows[0]["exception_type"] == "RuntimeError" and rows[0]["retryable"] is True
    assert "private-" not in output.getvalue()


async def test_schedule_mutation_is_debug_and_omits_user_content(output):
    from unittest.mock import MagicMock

    from plugin_schedule.schedule_types import TaskType
    from plugin_schedule.services import delete_periodic_task

    task = SimpleNamespace(id=uuid4(), task_type=TaskType.INTERVAL, schedule_id=uuid4(), name="private-schedule-name")
    crud = AsyncMock()
    crud.get_locked.return_value = task
    crud.schedule_crud = MagicMock(return_value=AsyncMock())
    await delete_periodic_task(crud, task.id)
    row = next(r for r in records(output) if r.get("event") == "schedule.mutation.staged")
    assert row["level"] == "DEBUG" and row["operation"] == "schedule.delete" and row["outcome"] == "staged"
    assert "private-" not in output.getvalue()


def test_username_validation_warning_is_structured_without_names(output, monkeypatch):
    from plugin_user import api

    monkeypatch.setattr(api, "check_username_pinyin", lambda *_args: SimpleNamespace(consistent=False))
    api._warn_username_pinyin_mismatch(operation="create_user", name="private-name", username="private-username")
    row = next(r for r in records(output) if r.get("event") == "user.validation.warning")
    assert row["reason_code"] == "username_pinyin_mismatch" and row["outcome"] == "accepted"
    assert "private-" not in output.getvalue()
