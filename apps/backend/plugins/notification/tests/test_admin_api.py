"""Administrative notification schemas, CRUD, and endpoint tests."""

from datetime import timedelta
from typing import Any, cast, get_type_hints
from uuid import UUID, uuid4

import plugin_notification.admin_api as admin_api_module
import pytest
from plugin_notification.admin_api import (
    cancel_announcement,
    create_announcement,
    create_template,
    delete_template,
    delivery_summary,
    get_template,
    list_announcements,
    list_deliveries,
    list_templates,
    preview_audience,
    publish_announcement,
    recall_announcement,
    retry_failed,
    update_template,
)
from plugin_notification.admin_schemas import (
    AnnouncementCreateRequest,
    AudiencePreviewRequest,
    AudienceRuleIn,
    DeliveryListQuery,
    MessageListQuery,
    TemplateCreateRequest,
    TemplateListQuery,
    TemplateUpdateRequest,
)
from plugin_notification.crud import MessageCRUD, OutboxCRUD, TemplateCRUD
from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.models import NotificationOutbox
from rapidkit_common.auth import UserProtocol, VerifyPermissionDep
from rapidkit_common.protocols.notification import AudiencePreview, NotificationResult
from rapidkit_common.transaction import run_after_commit_hooks
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from sqlmodel import col


class _CurrentUser:
    def __init__(self) -> None:
        self.id = uuid4()
        self.is_admin = True
        self.roles: list[str] = []
        self.department_id: UUID | None = None


class _AdminService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []
        self.enqueue_count = 0

    async def create_message(self, command, *, created_by, publish_at, expire_at):
        self.calls.append(("create", (command, created_by, publish_at, expire_at)))
        return NotificationResult(
            message_id=uuid4(),
            recipient_count=0,
            deduplicated=False,
        )

    async def publish(self, message_id, *, operator_id):
        self.calls.append(("publish", (message_id, operator_id)))
        return NotificationResult(
            message_id=message_id,
            recipient_count=3,
            deduplicated=False,
        )

    async def cancel(self, message_id, *, operator_id):
        self.calls.append(("cancel", (message_id, operator_id)))

    async def recall(self, message_id, *, operator_id):
        self.calls.append(("recall", (message_id, operator_id)))

    async def preview_audience(self, audience):
        self.calls.append(("preview", audience))
        return AudiencePreview(total=2, by_type={"all": 2})

    def enqueue_delivery(self):
        self.enqueue_count += 1


def _user() -> UserProtocol:
    return cast(UserProtocol, _CurrentUser())


def _template_body(
    *,
    code: str,
    name: str = "Template",
    category: str = "ops.notice",
    enabled: bool = True,
) -> TemplateCreateRequest:
    return TemplateCreateRequest(
        code=code,
        name=name,
        category=category,
        content_mode="raw",
        title_template="Hello {username}",
        content_template="Body {username}",
        content_format="plain_text",
        variable_schema={"username": {"type": "string", "required": True}},
        enabled=enabled,
    )


async def _create_message(
    session,
    *,
    category: str,
    status: str,
    title: str,
):
    return await MessageCRUD(session).create(
        {
            "source": "admin",
            "category": category,
            "level": "info",
            "content_mode": "raw",
            "title": title,
            "content": "Body",
            "content_format": "plain_text",
            "channels": ["in_app"],
            "status": status,
            "correlation_id": uuid4().hex,
        }
    )


async def _create_outbox(session, message_id, *, status: str, user_id=None):
    user_id = user_id or uuid4()
    return await OutboxCRUD(session).create(
        {
            "message_id": message_id,
            "user_id": user_id,
            "channel": "in_app",
            "status": status,
            "idempotency_key": f"{message_id}:{user_id}:in_app",
            "attempt_count": 5,
            "last_error_code": "delivery_failed",
            "locked_by": "worker-1",
            "locked_until": timezone.now() + timedelta(minutes=1),
            "next_attempt_at": timezone.now() + timedelta(minutes=5),
        }
    )


def test_admin_schemas_reject_invalid_content_modes_and_channels():
    with pytest.raises(ValueError):
        _template_body(code="invalid").model_copy(update={"content_mode": "html"}).__class__.model_validate(
            {
                **_template_body(code="invalid").model_dump(),
                "content_mode": "html",
            }
        )

    with pytest.raises(ValueError):
        AnnouncementCreateRequest(
            raw_title="Title",
            raw_content="Body",
            audience=[AudienceRuleIn(type="all")],
            channels=["email"],
        )


def test_all_admin_endpoints_require_permission_verified_user():
    endpoints = [
        list_templates,
        create_template,
        get_template,
        update_template,
        delete_template,
        list_announcements,
        create_announcement,
        preview_audience,
        publish_announcement,
        cancel_announcement,
        recall_announcement,
        list_deliveries,
        delivery_summary,
        retry_failed,
    ]

    for endpoint in endpoints:
        hints = get_type_hints(endpoint, include_extras=True)
        assert hints["current_user"] == VerifyPermissionDep


@pytest.mark.asyncio
async def test_template_crud_and_filtered_pagination(db_session):
    crud = TemplateCRUD(db_session)
    user = _user()
    first = await create_template(
        body=_template_body(code="ops.active", name="Active Ops"),
        current_user=user,
        crud=crud,
        session=db_session,
    )
    await create_template(
        body=_template_body(
            code="sales.disabled",
            name="Disabled Sales",
            category="sales.notice",
            enabled=False,
        ),
        current_user=user,
        crud=crud,
        session=db_session,
    )

    page = await list_templates(
        query=TemplateListQuery(keyword="ops", enabled=True, page=1, page_size=1),
        current_user=user,
        crud=crud,
    )

    assert page.data is not None
    assert page.data.page_size == 1
    assert page.data.total == 1
    assert [item.code for item in page.data.records] == ["ops.active"]

    detail = await get_template(
        template_id=first.data.id,
        current_user=user,
        crud=crud,
    )
    assert detail.data is not None
    assert detail.data.code == "ops.active"

    updated = await update_template(
        template_id=first.data.id,
        body=TemplateUpdateRequest(name="Renamed"),
        current_user=user,
        crud=crud,
        session=db_session,
    )
    assert updated.data is not None
    assert updated.data.name == "Renamed"
    assert updated.data.version == 2

    await delete_template(
        template_id=first.data.id,
        current_user=user,
        crud=crud,
        session=db_session,
    )
    assert await crud.get(first.data.id) is None


@pytest.mark.asyncio
async def test_template_create_conflict_and_missing_detail_raise(db_session):
    crud = TemplateCRUD(db_session)
    user = _user()
    await create_template(
        body=_template_body(code="duplicate"),
        current_user=user,
        crud=crud,
        session=db_session,
    )

    with pytest.raises(AppException):
        await create_template(
            body=_template_body(code="duplicate"),
            current_user=user,
            crud=crud,
            session=db_session,
        )
    with pytest.raises(AppException):
        await get_template(
            template_id=uuid4(),
            current_user=user,
            crud=crud,
        )


@pytest.mark.asyncio
async def test_announcement_list_filters_status_and_category(db_session):
    await _create_message(
        db_session,
        category="ops.notice",
        status=MessageStatus.DRAFT.value,
        title="Match",
    )
    await _create_message(
        db_session,
        category="ops.notice",
        status=MessageStatus.PUBLISHED.value,
        title="Wrong status",
    )
    await _create_message(
        db_session,
        category="sales.notice",
        status=MessageStatus.DRAFT.value,
        title="Wrong category",
    )

    response = await list_announcements(
        query=MessageListQuery(
            status=MessageStatus.DRAFT.value,
            category="ops.notice",
            page=1,
            page_size=10,
        ),
        current_user=_user(),
        crud=MessageCRUD(db_session),
    )

    assert response.data is not None
    assert response.data.total == 1
    assert [record.title for record in response.data.records] == ["Match"]


@pytest.mark.asyncio
async def test_announcement_lifecycle_endpoints_forward_verified_operator():
    user = _user()
    service = _AdminService()
    message_id = uuid4()
    body = AnnouncementCreateRequest(
        raw_title="Title",
        raw_content="Body",
        audience=[AudienceRuleIn(type="all")],
    )

    created = await create_announcement(
        body=body,
        current_user=user,
        service=service,
    )
    preview = await preview_audience(
        message_id=message_id,
        body=AudiencePreviewRequest(audience=[AudienceRuleIn(type="all")]),
        current_user=user,
        service=service,
    )
    published = await publish_announcement(
        message_id=message_id,
        current_user=user,
        service=service,
    )
    await cancel_announcement(
        message_id=message_id,
        current_user=user,
        service=service,
    )
    await recall_announcement(
        message_id=message_id,
        current_user=user,
        service=service,
    )

    assert created.data is not None and "messageId" in created.data
    assert preview.data is not None and preview.data.total == 2
    assert published.data == {"recipientCount": 3}
    assert [call[0] for call in service.calls] == [
        "create",
        "preview",
        "publish",
        "cancel",
        "recall",
    ]
    assert service.calls[0][1][1] == user.id
    assert service.calls[2][1] == (message_id, user.id)


@pytest.mark.asyncio
async def test_delivery_list_summary_and_retry_enqueue(db_session):
    first_message = await _create_message(
        db_session,
        category="ops.notice",
        status=MessageStatus.PUBLISHED.value,
        title="First",
    )
    second_message = await _create_message(
        db_session,
        category="ops.notice",
        status=MessageStatus.PUBLISHED.value,
        title="Second",
    )
    dead = await _create_outbox(
        db_session,
        first_message.id,
        status=OutboxStatus.DEAD.value,
    )
    await _create_outbox(
        db_session,
        first_message.id,
        status=OutboxStatus.SENT.value,
    )
    await _create_outbox(
        db_session,
        second_message.id,
        status=OutboxStatus.DEAD.value,
    )
    crud = OutboxCRUD(db_session)
    user = _user()

    page = await list_deliveries(
        query=DeliveryListQuery(
            message_id=first_message.id,
            status=OutboxStatus.DEAD.value,
            page=1,
            page_size=1,
        ),
        current_user=user,
        crud=crud,
    )
    summary = await delivery_summary(
        message_id=first_message.id,
        current_user=user,
        crud=crud,
    )
    service = _AdminService()
    retried = await retry_failed(
        message_id=first_message.id,
        current_user=user,
        crud=crud,
        service=service,
        session=db_session,
    )

    assert page.data is not None
    assert page.data.page_size == 1
    assert page.data.total == 1
    assert [record.id for record in page.data.records] == [dead.id]
    assert summary.data is not None
    assert summary.data.by_status == {"dead": 1, "sent": 1}
    assert retried.data == {"retried": 1}
    assert service.enqueue_count == 0
    await run_after_commit_hooks(db_session)
    assert service.enqueue_count == 1

    refreshed = await crud.get(dead.id)
    assert refreshed is not None
    assert refreshed.status == OutboxStatus.PENDING.value
    assert refreshed.attempt_count == 0
    assert refreshed.last_error_code is None
    assert refreshed.locked_by is None
    assert refreshed.locked_until is None
    assert refreshed.next_attempt_at is not None
    assert refreshed.idempotency_key == dead.idempotency_key
    pending = await crud.get_all(
        col(NotificationOutbox.message_id) == first_message.id,
        col(NotificationOutbox.status) == OutboxStatus.PENDING.value,
    )
    assert len(pending) == 1


@pytest.mark.asyncio
async def test_mutations_audit_only_safe_fields_after_commit(db_session, monkeypatch):
    audits = []

    def record_audit(action, **fields):
        audits.append((action, fields))

    monkeypatch.setattr(admin_api_module, "audit", record_audit)
    user = _user()
    crud = TemplateCRUD(db_session)
    body = _template_body(code="secure.audit")
    body.title_template = "TOP-SECRET-TITLE {username}"
    body.content_template = "TOP-SECRET-CONTENT {username}"
    body.variable_schema = {"TOP-SECRET-VARIABLE": {"type": "string", "required": True}}

    created = await create_template(
        body=body,
        current_user=user,
        crud=crud,
        session=db_session,
    )
    assert audits == []
    await run_after_commit_hooks(db_session)

    await update_template(
        template_id=created.data.id,
        body=TemplateUpdateRequest(name="Renamed"),
        current_user=user,
        crud=crud,
        session=db_session,
    )
    assert len(audits) == 1
    await run_after_commit_hooks(db_session)

    await delete_template(
        template_id=created.data.id,
        current_user=user,
        crud=crud,
        session=db_session,
    )
    assert len(audits) == 2
    await run_after_commit_hooks(db_session)

    assert [action for action, _fields in audits] == [
        "template.create",
        "template.update",
        "template.delete",
    ]
    assert all(fields == {"operator_id": user.id, "target_id": created.data.id} for _, fields in audits)
    assert "TOP-SECRET" not in repr(audits)


@pytest.mark.asyncio
async def test_retry_zero_registers_no_after_commit_side_effects(db_session, monkeypatch):
    audits = []
    monkeypatch.setattr(
        admin_api_module,
        "audit",
        lambda action, **fields: audits.append((action, fields)),
    )
    service = _AdminService()

    response = await retry_failed(
        message_id=uuid4(),
        current_user=_user(),
        crud=OutboxCRUD(db_session),
        service=service,
        session=db_session,
    )
    await run_after_commit_hooks(db_session)

    assert response.data == {"retried": 0}
    assert service.enqueue_count == 0
    assert audits == []
