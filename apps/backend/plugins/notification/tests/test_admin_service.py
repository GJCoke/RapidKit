"""Administrative notification service and audit tests."""

from datetime import timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import plugin_notification.admin_service as admin_service_module
import plugin_notification.audit as audit_module
import pytest
from plugin_notification.admin_service import AdminNotificationService
from plugin_notification.audit import audit
from plugin_notification.crud import MessageCRUD
from plugin_notification.enums import MessageStatus
from plugin_notification.models import NotificationAudience, NotificationMessage, NotificationOutbox, UserNotification
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.timezone import timezone
from sqlmodel import select


class _StubQueryService:
    def __init__(
        self,
        all_user_ids: list[UUID],
        *,
        role_users: dict[str, list[UUID]] | None = None,
    ) -> None:
        self._all_user_ids = all_user_ids
        self._role_users = role_users or {}

    async def get_active_user_ids(self, user_ids: list[UUID]) -> list[UUID]:
        return list(user_ids)

    async def get_active_user_ids_by_role(self, role_code: str) -> list[UUID]:
        return list(self._role_users.get(role_code, []))

    async def get_active_user_ids_by_department(self, department_id: UUID, include_descendants: bool = False) -> list:
        return []

    async def get_all_active_user_ids(self) -> list[UUID]:
        return list(self._all_user_ids)


class _SessionContext:
    def __init__(self, session) -> None:
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc_info: Any) -> bool:
        return False


class _RecordingLogger:
    def __init__(self) -> None:
        self.warnings: list[tuple[str, tuple[Any, ...]]] = []

    def warning(self, message: str, *args: Any) -> None:
        self.warnings.append((message, args))


def _command(*, audience: list[AudienceRule] | None = None) -> NotificationCommand:
    return NotificationCommand(
        source="admin",
        category="admin.announcement",
        level="info",
        raw_title="TOP-SECRET-TITLE",
        raw_content="TOP-SECRET-CONTENT",
        audience=audience or [AudienceRule(type="all")],
        meta={"privateVariable": "TOP-SECRET-VARIABLE"},
    )


def _service(db_session, user_ids, **kwargs) -> AdminNotificationService:
    return AdminNotificationService(
        session_factory=lambda: _SessionContext(db_session),
        query_service=cast(UserQueryService, _StubQueryService(user_ids)),
        enqueue_delivery=kwargs.get("enqueue_delivery", lambda: None),
        recall_broadcaster=kwargs.get("recall_broadcaster"),
    )


def test_audit_logs_only_identifiers_and_audience_types(monkeypatch):
    logger = _RecordingLogger()
    monkeypatch.setattr(audit_module, "logger", logger)
    operator_id, target_id = uuid4(), uuid4()

    audit(
        "create",
        operator_id=operator_id,
        target_id=target_id,
        correlation_id="correlation-1",
        audience_summary="all,user",
    )

    rendered = repr(logger.warnings)
    assert str(operator_id) in rendered
    assert str(target_id) in rendered
    assert "correlation-1" in rendered
    assert "all,user" in rendered
    assert "TOP-SECRET" not in rendered


@pytest.mark.asyncio
async def test_create_commits_before_audit_without_exposing_content(db_session, monkeypatch):
    audit_calls = []

    def record_audit(action, **fields):
        audit_calls.append((action, fields, not db_session.in_transaction()))

    monkeypatch.setattr(admin_service_module, "audit", record_audit)
    service = _service(db_session, [uuid4()])
    operator_id = uuid4()

    result = await service.create_message(_command(), created_by=operator_id)

    message = await MessageCRUD(db_session).get(result.message_id)
    assert result.recipient_count == 0
    assert message is not None
    assert message.status == MessageStatus.DRAFT.value
    assert audit_calls[0][0] == "create"
    assert audit_calls[0][2] is True
    assert audit_calls[0][1]["operator_id"] == operator_id
    assert audit_calls[0][1]["target_id"] == result.message_id
    assert audit_calls[0][1]["correlation_id"] == message.correlation_id
    assert audit_calls[0][1]["audience_summary"] == "all"
    assert "TOP-SECRET" not in repr(audit_calls)


@pytest.mark.asyncio
async def test_service_planned_draft_stays_out_of_queue_until_explicit_scheduling(db_session):
    enqueued = []
    service = _service(db_session, [uuid4()], enqueue_delivery=lambda: enqueued.append(True))
    operator_id = uuid4()
    future = timezone.now() + timedelta(hours=1)
    result = await service.create_message(_command(), created_by=operator_id, publish_at=future, save_as_draft=True)
    message, _ = await service.get_message(result.message_id)
    assert message.status == MessageStatus.DRAFT.value
    assert message.publish_at == future
    assert await MessageCRUD(db_session).get_due_scheduled(future) == []

    updated = await service.update_message(
        result.message_id,
        _command(),
        operator_id=operator_id,
        publish_at=future,
        expire_at=None,
        save_as_draft=True,
    )
    assert updated.status == MessageStatus.DRAFT.value
    assert updated.publish_at == future
    assert await MessageCRUD(db_session).get_due_scheduled(future) == []

    scheduled = await service.update_message(
        result.message_id,
        _command(),
        operator_id=operator_id,
        publish_at=future,
        expire_at=None,
        save_as_draft=False,
    )
    assert scheduled.status == MessageStatus.SCHEDULED.value
    assert [row.id for row in await MessageCRUD(db_session).get_due_scheduled(future)] == [result.message_id]
    assert (await db_session.exec(select(UserNotification))).all() == []
    assert enqueued == []


@pytest.mark.asyncio
async def test_unsaved_audience_preview_does_not_persist_any_notification_rows(db_session):
    service = _service(db_session, [uuid4(), uuid4()])

    preview = await service.preview_audience([AudienceRule(type="all")])

    assert preview.total == 2
    assert preview.by_type == {"all": 2}
    for model in (NotificationMessage, NotificationAudience, UserNotification, NotificationOutbox):
        assert (await db_session.exec(select(model))).all() == []


@pytest.mark.asyncio
async def test_publish_commits_before_enqueue_and_audit(db_session, monkeypatch):
    events = []

    def enqueue():
        events.append(("enqueue", not db_session.in_transaction()))

    def record_audit(action, **fields):
        events.append((action, not db_session.in_transaction(), fields))

    monkeypatch.setattr(admin_service_module, "audit", record_audit)
    service = _service(db_session, [uuid4(), uuid4()], enqueue_delivery=enqueue)
    created = await service.create_message(_command(), created_by=uuid4())
    events.clear()

    published = await service.publish(created.message_id, operator_id=uuid4())

    assert published.recipient_count == 2
    assert events[0] == ("enqueue", True)
    assert events[1][0:2] == ("publish", True)
    inbox = (await db_session.exec(select(UserNotification))).all()
    assert len(inbox) == 2


@pytest.mark.asyncio
async def test_publish_enqueue_failure_keeps_committed_success(db_session, monkeypatch):
    logger = _RecordingLogger()
    monkeypatch.setattr(admin_service_module, "logger", logger)
    monkeypatch.setattr(admin_service_module, "audit", lambda *args, **kwargs: None)

    def fail_enqueue():
        assert not db_session.in_transaction()
        raise RuntimeError("broker unavailable")

    service = _service(db_session, [uuid4()], enqueue_delivery=fail_enqueue)
    created = await service.create_message(_command(), created_by=uuid4())

    published = await service.publish(created.message_id, operator_id=uuid4())

    message = await MessageCRUD(db_session).get(created.message_id)
    assert published.recipient_count == 1
    assert message is not None
    assert message.status == MessageStatus.PUBLISHED.value
    assert "beat will retry" in repr(logger.warnings)


@pytest.mark.asyncio
async def test_cancel_commits_before_audit(db_session, monkeypatch):
    audited_after_commit = []

    def record_audit(action, **fields):
        audited_after_commit.append((action, not db_session.in_transaction()))

    monkeypatch.setattr(admin_service_module, "audit", record_audit)
    service = _service(db_session, [uuid4()])
    created = await service.create_message(_command(), created_by=uuid4())
    audited_after_commit.clear()

    await service.cancel(created.message_id, operator_id=uuid4())

    message = await MessageCRUD(db_session).get(created.message_id)
    assert message is not None
    assert message.status == MessageStatus.CANCELLED.value
    assert audited_after_commit == [("cancel", True)]


@pytest.mark.asyncio
async def test_recall_broadcast_failure_isolated_after_commit(db_session, monkeypatch):
    events = []

    async def fail_broadcast(message_id):
        events.append(("broadcast", not db_session.in_transaction(), message_id))
        raise RuntimeError("socket unavailable")

    def record_audit(action, **fields):
        events.append((action, not db_session.in_transaction(), fields))

    logger = _RecordingLogger()
    monkeypatch.setattr(admin_service_module, "audit", record_audit)
    monkeypatch.setattr(admin_service_module, "logger", logger)
    service = _service(
        db_session,
        [uuid4()],
        recall_broadcaster=fail_broadcast,
    )
    created = await service.create_message(_command(), created_by=uuid4())
    await service.publish(created.message_id, operator_id=uuid4())
    events.clear()

    await service.recall(created.message_id, operator_id=uuid4())

    message = await MessageCRUD(db_session).get(created.message_id)
    assert message is not None
    assert message.status == MessageStatus.RECALLED.value
    assert events[0][0:2] == ("broadcast", True)
    assert events[1][0:2] == ("recall", True)
    assert "Recall broadcast failed" in repr(logger.warnings)


@pytest.mark.asyncio
async def test_preview_audience_uses_unions_for_total_and_each_type(db_session):
    first_id, second_id, third_id, fourth_id = uuid4(), uuid4(), uuid4(), uuid4()
    service = AdminNotificationService(
        session_factory=lambda: _SessionContext(db_session),
        query_service=cast(
            UserQueryService,
            _StubQueryService(
                [third_id, fourth_id],
                role_users={"operators": [first_id, second_id], "reviewers": [second_id, third_id]},
            ),
        ),
        enqueue_delivery=lambda: None,
    )

    preview = await service.preview_audience(
        [
            AudienceRule(type="user", value=str(first_id)),
            AudienceRule(type="user", value=str(first_id)),
            AudienceRule(type="role", value="operators"),
            AudienceRule(type="role", value="reviewers"),
            AudienceRule(type="all"),
        ]
    )

    assert preview.total == 4
    assert preview.by_type == {"user": 1, "role": 3, "all": 2}
