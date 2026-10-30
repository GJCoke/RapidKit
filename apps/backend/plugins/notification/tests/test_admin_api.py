"""Administrative notification schemas, CRUD, and endpoint tests."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, cast, get_type_hints
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import plugin_notification.admin.api as admin_api_module
import plugin_notification.admin.schemas as admin_schemas_module
import pytest
from fastapi import FastAPI, Request
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from plugin_notification.admin.api import (
    cancel_announcement,
    create_announcement,
    create_template,
    delete_template,
    delivery_summary,
    list_announcements,
    list_deliveries,
    list_templates,
    preview_unsaved_audience,
    publish_announcement,
    recall_announcement,
    retry_failed,
    update_announcement,
    update_template,
)
from plugin_notification.admin.deps import get_admin_service, get_message_crud
from plugin_notification.admin.schemas import (
    AnnouncementCreateRequest,
    AnnouncementUpdateRequest,
    AudiencePreviewRequest,
    AudienceRuleIn,
    DeliveryListQuery,
    MessageListQuery,
    TemplateCreateRequest,
    TemplateListQuery,
    TemplateUpdateRequest,
)
from plugin_notification.admin.services import AdminNotificationService
from plugin_notification.crud import MessageCRUD, OutboxCRUD, TemplateCRUD
from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.models import NotificationOutbox
from rapidkit_common.access import access_guard_dependency, inspect_route_access
from rapidkit_common.access_testing import allow_access, deny_access
from rapidkit_common.auth import UserDBDep, UserProtocol, _get_current_user_placeholder
from rapidkit_common.protocols.notification import AudiencePreview, NotificationResult
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_common.transaction import run_after_commit_hooks
from rapidkit_core.timezone import TimeZone, timezone
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

    async def create_message(self, command, *, created_by, publish_at, expire_at, save_as_draft=False):
        self.calls.append(("create", (command, created_by, publish_at, expire_at, save_as_draft)))
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

    async def preview_audience(self, audience, *, message_id=None):
        self.calls.append(("preview", (audience, message_id)))
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
        update_template,
        delete_template,
        list_announcements,
        create_announcement,
        preview_unsaved_audience,
        publish_announcement,
        cancel_announcement,
        recall_announcement,
        list_deliveries,
        delivery_summary,
        retry_failed,
    ]

    for endpoint in endpoints:
        hints = get_type_hints(endpoint, include_extras=True)
        assert hints["current_user"] == UserDBDep

    for route in admin_api_module.router.routes:
        assert isinstance(route, APIRoute)
        assert [access.kind for access in inspect_route_access(route)] == ["require"]


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

    detail = await crud.get(first.data.id)
    assert detail is not None
    assert detail.code == "ops.active"

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
async def test_template_examples_persist_across_create_update_and_database_reload(db_session):
    crud = TemplateCRUD(db_session)
    user = _user()
    schema = {
        "username": {"type": "string", "required": True, "example": "张三"},
        "count": {"type": "integer", "example": 0},
        "flag": {"type": "boolean", "example": False},
    }
    body = _template_body(code="examples.persisted")
    body.variable_schema = schema
    created = await create_template(body=body, current_user=user, crud=crud, session=db_session)
    assert created.data is not None
    template_id = created.data.id
    await db_session.commit()
    db_session.expunge_all()

    detail = await crud.get(template_id)
    assert detail is not None
    assert detail.variable_schema == schema
    assert detail.variable_schema["count"]["example"] == 0
    assert detail.variable_schema["flag"]["example"] is False
    page = await list_templates(query=TemplateListQuery(keyword="examples.persisted"), current_user=user, crud=crud)
    assert page.data is not None
    assert page.data.records[0].variable_schema == schema

    updated_schema = {**schema, "username": {**schema["username"], "example": "李四"}}
    await update_template(
        template_id=template_id,
        body=TemplateUpdateRequest(variable_schema=updated_schema),
        current_user=user,
        crud=crud,
        session=db_session,
    )
    await db_session.commit()
    db_session.expunge_all()
    reloaded = await crud.get(template_id)
    assert reloaded is not None
    assert reloaded.variable_schema == updated_schema
    assert reloaded.version == 2


@pytest.mark.asyncio
async def test_template_create_conflict_raises(db_session):
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
async def test_announcement_lifecycle_endpoints_forward_verified_operator(db_session):
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
        session=db_session,
        request=Request({"type": "http"}),
    )
    preview = await preview_unsaved_audience(
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
    assert service.calls[1][1][1] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("draft_flag", [None, False, True])
async def test_create_announcement_forwards_optional_camel_case_draft_flag(db_session, draft_flag):
    service = _AdminService()
    payload = {
        "rawTitle": "Title",
        "rawContent": "Body",
        "publishAt": "2030-01-01T10:00:00",
        "audience": [{"type": "all"}],
    }
    if draft_flag is not None:
        payload["saveAsDraft"] = draft_flag
    body = AnnouncementCreateRequest.model_validate(payload)

    await create_announcement(
        body=body, current_user=_user(), service=service, session=db_session, request=Request({"type": "http"})
    )

    assert service.calls[0][1][4] is (draft_flag is True)
    assert service.calls[0][1][2] == body.publish_at


@pytest.mark.asyncio
@pytest.mark.parametrize("draft_flag", [None, False, True])
async def test_update_announcement_forwards_optional_camel_case_draft_flag(db_session, draft_flag):
    message = await _create_message(
        db_session, category="admin.announcement", status=MessageStatus.DRAFT.value, title="Title"
    )

    class _UpdateService(_AdminService):
        async def update_message(self, message_id, command, *, operator_id, publish_at, expire_at, save_as_draft=False):
            self.calls.append(("update", (message_id, operator_id, publish_at, save_as_draft)))

        async def get_message(self, message_id):
            assert message_id == message.id
            return message, []

    service = _UpdateService()
    payload = {
        "rawTitle": "Title",
        "rawContent": "Body",
        "publishAt": "2030-01-01T10:00:00",
        "audience": [{"type": "all"}],
    }
    if draft_flag is not None:
        payload["saveAsDraft"] = draft_flag
    body = AnnouncementUpdateRequest.model_validate(payload)
    user = _user()

    response = await update_announcement(
        message_id=message.id,
        body=body,
        current_user=user,
        service=service,
        session=db_session,
        request=Request({"type": "http"}),
    )

    assert response.data is not None
    assert service.calls == [("update", (message.id, user.id, body.publish_at, draft_flag is True))]


@pytest.mark.asyncio
@pytest.mark.parametrize("authorized", [True, False])
async def test_unsaved_audience_preview_only_resolves_audience_without_message_id(authorized):
    class _PreviewOnlyService:
        def __init__(self):
            self.audiences = []

        async def preview_audience(self, audience):
            self.audiences.append(audience)
            return AudiencePreview(total=7, by_type={"department": 7})

    service = _PreviewOnlyService()
    department_id = str(uuid4())
    app = FastAPI()
    app.include_router(admin_api_module.router)

    app.dependency_overrides[access_guard_dependency] = allow_access(_user()) if authorized else deny_access()
    app.dependency_overrides[_get_current_user_placeholder] = _user
    app.dependency_overrides[get_admin_service] = lambda: service
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/admin/notifications/audience-preview",
            json={"audience": [{"type": "department", "value": department_id, "includeDescendants": True}]},
        )

    if not authorized:
        assert response.status_code == 403
        assert service.audiences == []
        return
    assert response.status_code == 200
    assert response.json()["data"] == {"total": 7, "byType": {"department": 7}}
    assert len(service.audiences) == 1
    rule = service.audiences[0][0]
    assert (rule.type, rule.value, rule.include_descendants) == ("department", department_id, True)
    hints = get_type_hints(admin_api_module.preview_unsaved_audience, include_extras=True)
    assert hints["current_user"] == UserDBDep
    assert "message_id" not in hints


@pytest.mark.asyncio
@pytest.mark.parametrize("browser_timezone", ["UTC", "America/New_York"])
async def test_announcement_detail_dates_keep_the_same_instant_through_edit_update(
    db_session, monkeypatch, browser_timezone
):
    local_timezone = TimeZone("Asia/Shanghai")
    monkeypatch.setattr("rapidkit_core.timezone.timezone", local_timezone)
    monkeypatch.setattr(admin_schemas_module, "timezone", local_timezone, raising=False)

    class _QueryService:
        async def get_active_user_ids(self, user_ids):
            return list(user_ids)

        async def get_active_user_ids_by_role(self, role_code):
            return []

        async def get_active_user_ids_by_department(self, department_id, include_descendants=False):
            return []

        async def get_all_active_user_ids(self):
            return []

    @asynccontextmanager
    async def session_factory():
        yield db_session

    service = AdminNotificationService(
        session_factory=session_factory,
        query_service=cast(UserQueryService, _QueryService()),
        enqueue_delivery=lambda: None,
    )
    app = FastAPI()
    app.include_router(admin_api_module.router)
    app.dependency_overrides[access_guard_dependency] = allow_access(_user())
    app.dependency_overrides[_get_current_user_placeholder] = _user
    app.dependency_overrides[get_admin_service] = lambda: service
    app.dependency_overrides[get_message_crud] = lambda: MessageCRUD(db_session)
    payload = {
        "rawTitle": "Planned draft",
        "rawContent": "Body",
        "audience": [{"type": "all"}],
        "saveAsDraft": True,
        "publishAt": "2030-01-01T01:30:00",
        "expireAt": "2030-01-02T03:45:00",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post("/admin/notifications", json=payload)
        assert created.status_code == 200
        message_id = UUID(created.json()["data"]["messageId"])
        message = await MessageCRUD(db_session).get(message_id)
        assert message is not None
        message.create_time = datetime(2030, 1, 1, 0, 15)
        await db_session.commit()

        detail = await client.get(f"/admin/notifications/{message_id}")
        assert detail.status_code == 200
        data = detail.json()["data"]
        assert data["publishAt"] == "2030-01-01T09:30:00+08:00"
        assert data["expireAt"] == "2030-01-02T11:45:00+08:00"
        assert data["createTime"] == "2030-01-01T00:15:00+00:00"

        listing = await client.get("/admin/notifications")
        assert listing.status_code == 200
        list_data = listing.json()["data"]["records"][0]
        assert list_data["publishAt"] == "2030-01-01T01:30:00+00:00"
        assert list_data["expireAt"] == "2030-01-02T03:45:00+00:00"
        assert list_data["createTime"] == "2030-01-01T00:15:00+00:00"

        # The picker shows browser-local wall time and submits its naive UTC instant.
        browser_zone = ZoneInfo(browser_timezone)
        for field in ("publishAt", "expireAt"):
            picker_time = datetime.fromisoformat(data[field]).astimezone(browser_zone).replace(tzinfo=None)
            payload[field] = picker_time.replace(tzinfo=browser_zone).astimezone(UTC).replace(tzinfo=None).isoformat()
        updated = await client.put(f"/admin/notifications/{message_id}", json=payload)
        assert updated.status_code == 200
        assert updated.json()["data"]["publishAt"] == "2030-01-01T09:30:00+08:00"
        assert updated.json()["data"]["expireAt"] == "2030-01-02T11:45:00+08:00"

    db_session.expunge_all()
    reloaded = await MessageCRUD(db_session).get(message_id)
    assert reloaded is not None
    assert reloaded.publish_at == datetime(2030, 1, 1, 1, 30)
    assert reloaded.expire_at == datetime(2030, 1, 2, 3, 45)
    assert reloaded.status == MessageStatus.DRAFT.value


@pytest.mark.asyncio
async def test_delivery_list_summary_and_retry_enqueue(db_session, monkeypatch):
    class _DisplayUsers:
        async def get_display_profiles(self, user_ids):
            return {}

    monkeypatch.setattr(admin_api_module, "get_service", lambda protocol: _DisplayUsers())
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
