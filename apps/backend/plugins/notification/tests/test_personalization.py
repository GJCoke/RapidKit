"""Recipient bindings are resolved once at publish, then shared across delivery paths."""

from contextlib import asynccontextmanager
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException, Request
from httpx import ASGITransport, AsyncClient
from plugin_notification.admin_api import router
from plugin_notification.admin_deps import get_admin_service
from plugin_notification.admin_service import AdminNotificationService
from plugin_notification.api import _to_item
from plugin_notification.audience import AudienceResolver
from plugin_notification.channels import ChannelRegistry, ChannelResult
from plugin_notification.crud import MessageCRUD, PreferenceCRUD, TemplateCRUD
from plugin_notification.models import NotificationOutbox, UserNotification
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.personalization import prepare_personalization, render_personalized
from plugin_notification.preference import PreferenceResolver
from plugin_notification.renderer import RenderedContent
from plugin_notification.tasks import _build_orchestrator, _publish_due
from plugin_notification.worker import DeliveryWorker
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand, RecipientVariableBinding
from rapidkit_common.protocols.user import UserPublicProfile
from rapidkit_core.config import settings
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from sqlmodel import select


class Profiles:
    def __init__(self, users):
        self.users = users
        self.calls = []

    async def get_active_user_ids(self, ids):
        return [uid for uid in ids if uid in self.users]

    async def get_all_active_user_ids(self):
        return list(self.users) + list(self.users)

    async def get_public_profiles(self, ids):
        self.calls.append(list(ids))
        return {uid: self.users[uid] for uid in ids if uid in self.users}


def orchestrator(session, profiles):
    return MessageOrchestrator(session, AudienceResolver(profiles), PreferenceResolver(session))


async def template(session, *, required=True):
    return await TemplateCRUD(session).create(
        dict(
            code="personal",
            name="Personal",
            category="admin.announcement",
            content_mode="raw",
            title_template="Hello {recipient}",
            content_template="{email}|{roles}|{department}|{count}|{flag}",
            variable_schema={
                "recipient": {"type": "string", "required": True},
                "email": {"type": "string", "required": required},
                "roles": {"type": "string"},
                "department": {"type": "string"},
                "count": {"type": "integer", "required": True},
                "flag": {"type": "boolean", "required": True},
            },
            enabled=True,
        )
    )


def command(**patch):
    return NotificationCommand(
        **{
            "source": "admin",
            "category": "user.mention",
            "template_code": "personal",
            "template_variables": {"count": 0, "flag": False},
            "variable_bindings": {
                name: {"source": "recipient", "field": field}
                for name, field in (
                    ("recipient", "name"),
                    ("email", "email"),
                    ("roles", "roles"),
                    ("department", "department"),
                )
            },
            "audience": [AudienceRule(type="all")],
            **patch,
        }
    )


@pytest.mark.asyncio
async def test_publish_uses_current_profiles_and_preserves_template_and_delivery_snapshot(db_session):
    uid, excluded = uuid4(), uuid4()
    profiles = Profiles(
        {
            uid: UserPublicProfile(id=uid, name="Before", email="old@example.test"),
            excluded: UserPublicProfile(id=excluded, name="Excluded"),
        }
    )
    tpl = await template(db_session)
    await PreferenceCRUD(db_session).create(dict(user_id=excluded, category="user.mention", enabled=False))
    orch = orchestrator(db_session, profiles)
    message = await orch.create_message(command(), created_by=uuid4())
    await db_session.commit()
    assert profiles.calls == []
    tpl.title_template = "Changed {recipient}"
    profiles.users[uid] = UserPublicProfile(
        id=uid, name="After", email="after@example.test", roles="Editor、Viewer", department="Engineering"
    )
    assert await orch.publish_message(message.id) == 1
    await db_session.commit()
    assert profiles.calls == [[uid]]
    inbox = (await db_session.exec(select(UserNotification))).one()
    assert inbox.rendered_content["title"] == "Hello After"
    assert inbox.rendered_content["content"] == "after@example.test|Editor、Viewer|Engineering|0|False"
    profiles.users[uid] = UserPublicProfile(id=uid, name="Later")
    assert _to_item(inbox, message).title == "Hello After"
    worker = DeliveryWorker(db_session, None, None, "test")
    payload = await worker._build_payload(message.id, uid)
    assert payload["title"] == _to_item(inbox, message).title
    assert payload["content"] == _to_item(inbox, message).content
    assert profiles.calls == [[uid]]


@pytest.mark.asyncio
async def test_missing_required_recipient_value_rolls_back_entire_publish(db_session):
    first, second = uuid4(), uuid4()
    profiles = Profiles(
        {
            first: UserPublicProfile(id=first, name="A", email="a@example.test"),
            second: UserPublicProfile(id=second, name="B"),
        }
    )
    await template(db_session)
    orch = orchestrator(db_session, profiles)
    message = await orch.create_message(command(), created_by=uuid4())
    message_id = message.id
    await db_session.commit()
    with pytest.raises(AppException):
        async with db_session.begin_nested():
            await orch.publish_message(message_id)
    assert (await MessageCRUD(db_session).get(message_id)).status == "draft"
    assert (await db_session.exec(select(UserNotification))).all() == []
    assert (await db_session.exec(select(NotificationOutbox))).all() == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bindings,variables",
    [
        ({"unknown": {"source": "recipient", "field": "name"}}, {"count": 0, "flag": False}),
        ({"count": {"source": "recipient", "field": "name"}}, {"flag": False}),
        ({"recipient": {"source": "recipient", "field": "name"}}, {"recipient": "Manual", "count": 0, "flag": False}),
    ],
)
async def test_invalid_bindings_rejected_at_save(db_session, bindings, variables):
    await template(db_session)
    with pytest.raises(AppException):
        await orchestrator(db_session, Profiles({})).create_message(
            command(variable_bindings=bindings, template_variables=variables), created_by=uuid4()
        )


@pytest.mark.asyncio
async def test_optional_empty_values_render_empty_string(db_session):
    uid = uuid4()
    await template(db_session, required=False)
    orch = orchestrator(db_session, Profiles({uid: UserPublicProfile(id=uid, name="A")}))
    message = await orch.create_message(command(), created_by=uuid4())
    await orch.publish_message(message.id)
    row = (await db_session.exec(select(UserNotification))).one()
    assert row.rendered_content["content"] == "|||0|False"


@pytest.mark.asyncio
async def test_required_recipient_fields_report_names_and_sources_without_profile_values(db_session):
    tpl = await template(db_session)
    tpl.variable_schema["department"]["required"] = True
    _, config = prepare_personalization(
        tpl,
        {"count": 0, "flag": False},
        {
            name: RecipientVariableBinding(source="recipient", field=field)
            for name, field in (
                ("recipient", "name"),
                ("email", "email"),
                ("roles", "roles"),
                ("department", "department"),
            )
        },
    )
    with pytest.raises(AppException) as caught:
        render_personalized(config, UserPublicProfile(id=uuid4(), name="Preview", email=" ", department=""))
    assert caught.value.code == 92012
    assert caught.value.data == {
        "variableErrors": [
            {"name": "email", "source": "recipient", "field": "email", "reason": "required_value_missing"},
            {"name": "department", "source": "recipient", "field": "department", "reason": "required_value_missing"},
        ]
    }


@pytest.mark.asyncio
async def test_preview_is_readonly_checks_audience_and_requires_selected_user(db_session):

    uid, outsider = uuid4(), uuid4()
    await template(db_session, required=False)
    profiles = Profiles({uid: UserPublicProfile(id=uid, name="Preview")})

    @asynccontextmanager
    async def factory():
        yield db_session

    service = AdminNotificationService(
        session_factory=factory,
        query_service=profiles,
        enqueue_delivery=lambda: pytest.fail("preview enqueued delivery"),
    )
    cmd = command()
    args = dict(
        template_code=cmd.template_code,
        template_variables=cmd.template_variables,
        variable_bindings=cmd.variable_bindings,
        audience=cmd.audience,
    )
    for selected in (None, outsider):
        with pytest.raises(AppException):
            await service.preview_content(**args, preview_user_id=selected)
    result = await service.preview_content(**args, preview_user_id=uid)
    assert result.title == "Hello Preview"
    assert (await MessageCRUD(db_session).get_all()) == []
    assert (await db_session.exec(select(UserNotification))).all() == []
    assert (await db_session.exec(select(NotificationOutbox))).all() == []
    result = await service.preview_content(
        **{
            **args,
            "variable_bindings": {},
            "template_variables": {
                "recipient": "Static",
                "email": "",
                "roles": "",
                "department": "",
                "count": 0,
                "flag": False,
            },
        }
    )
    assert result.title == "Hello Static"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "admin,user_options_permission,allowed", [(True, False, True), (False, True, True), (False, False, False)]
)
async def test_preview_requires_user_options_permission(admin, user_options_permission, allowed):

    calls = []

    class PreviewService:
        async def preview_content(self, **kwargs):
            calls.append(kwargs)
            return RenderedContent("raw", "Preview", "Body", None, "plain_text")

    app = FastAPI()
    app.include_router(router)

    async def current_user(request: Request):
        request.state.permission_ctx = SimpleNamespace(
            permissions=[f"GET:{settings.API_PREFIX_V1}/users/all"] if user_options_permission else []
        )
        return SimpleNamespace(id=uuid4(), is_admin=admin)

    app.dependency_overrides[verify_user_permission] = current_user
    app.dependency_overrides[get_admin_service] = lambda: PreviewService()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = dict(
            templateCode="personal",
            variableBindings={"recipient": {"source": "recipient", "field": "name"}},
            audience=[{"type": "all"}],
            previewUserId=str(uuid4()),
        )
        if allowed:
            response = await client.post("/admin/notifications/content-preview", json=payload)
            assert response.status_code == 200
            assert response.json()["data"]["title"] == "Preview"
            assert len(calls) == 1
        else:
            response = await client.post("/admin/notifications/content-preview", json=payload)
            assert "detail" in response.json()
            assert calls == []


@pytest.mark.asyncio
async def test_i18n_snapshot_and_legacy_fallback_use_same_reader(db_session):
    uid = uuid4()
    tpl = await template(db_session, required=False)
    tpl.content_mode = "i18n"
    tpl.title_template = "notification.personal.title"
    tpl.content_template = "notification.personal.body"
    orch = orchestrator(db_session, Profiles({uid: UserPublicProfile(id=uid, name="A")}))
    message = await orch.create_message(command(), created_by=uuid4())
    await orch.publish_message(message.id)
    row = (await db_session.exec(select(UserNotification))).one()
    item = _to_item(row, message)
    worker = DeliveryWorker(db_session, None, None, "test")
    payload = await worker._build_payload(message.id, uid)
    assert item.content_params == payload["contentParams"]
    assert item.content_params["recipient"] == "A"
    row.rendered_content = None
    message.content = "Legacy body"
    assert _to_item(row, message).content == "Legacy body"
    assert (await worker._build_payload(message.id, uid))["content"] == "Legacy body"


@pytest.mark.asyncio
async def test_delivery_retry_reuses_recipient_snapshot_after_profile_and_shared_content_changes(db_session):
    uid = uuid4()
    profiles = Profiles({uid: UserPublicProfile(id=uid, name="Original")})
    await template(db_session, required=False)
    orch = orchestrator(db_session, profiles)
    message = await orch.create_message(command(), created_by=uuid4())
    await orch.publish_message(message.id)
    await db_session.commit()
    payloads = []

    class RetryChannel:
        async def deliver(self, *, redis, user_id, payload):
            payloads.append((user_id, payload))
            return ChannelResult(success=len(payloads) > 1, error_code="temporary" if len(payloads) == 1 else None)

    registry = ChannelRegistry()
    registry.register("in_app", RetryChannel())
    worker = DeliveryWorker(db_session, None, registry, "test", jitter=lambda low, high: 0)
    assert await worker.run_once() == 1
    outbox = (await db_session.exec(select(NotificationOutbox))).one()
    assert outbox.status == "retrying"
    idempotency_key = outbox.idempotency_key
    outbox.next_attempt_at = timezone.now() - timedelta(seconds=1)
    message.title = "Changed shared title"
    profiles.users[uid] = UserPublicProfile(id=uid, name="Changed profile")
    assert await worker.run_once() == 1
    assert outbox.status == "sent"
    assert outbox.idempotency_key == idempotency_key
    assert payloads[0] == payloads[1]
    assert payloads[1][1]["title"] == "Hello Original"
    assert profiles.calls == [[uid]]


@pytest.mark.asyncio
async def test_scheduled_publication_resolves_late_profiles_and_rolls_back_one_invalid_message(db_session, monkeypatch):
    uid = uuid4()
    profiles = Profiles({uid: UserPublicProfile(id=uid, name="Before")})
    await template(db_session)
    optional_template = await TemplateCRUD(db_session).create(
        dict(
            code="optional",
            name="Optional",
            category="user.mention",
            content_mode="raw",
            title_template="Hello {recipient}",
            content_template="{email}",
            variable_schema={"recipient": {"type": "string", "required": True}, "email": {"type": "string"}},
            enabled=True,
        )
    )
    monkeypatch.setattr("plugin_notification.tasks.get_service", lambda protocol: profiles)
    orch = _build_orchestrator(db_session)
    failed = await orch.create_message(command(), created_by=uuid4(), publish_at=timezone.now() - timedelta(minutes=1))
    failed_id = failed.id
    good = await orch.create_message(
        command(
            template_code=optional_template.code,
            template_variables={},
            variable_bindings={
                "recipient": {"source": "recipient", "field": "name"},
                "email": {"source": "recipient", "field": "email"},
            },
        ),
        created_by=uuid4(),
        publish_at=timezone.now() - timedelta(minutes=1),
    )
    good_id = good.id
    await db_session.commit()
    profiles.users[uid] = UserPublicProfile(id=uid, name="At publish")
    assert await _publish_due(db_session, orch) == 1
    assert (await MessageCRUD(db_session).get(failed_id)).status == "scheduled"
    assert (await MessageCRUD(db_session).get(good_id)).status == "published"
    inbox = (await db_session.exec(select(UserNotification))).one()
    assert inbox.message_id == good_id
    assert inbox.rendered_content["title"] == "Hello At publish"
    assert len((await db_session.exec(select(NotificationOutbox))).all()) == 1


@pytest.mark.asyncio
async def test_preview_endpoint_requires_its_own_permission_before_service_access():
    app = FastAPI()
    app.include_router(router)

    async def forbidden():
        raise HTTPException(status_code=403)

    app.dependency_overrides[verify_user_permission] = forbidden
    app.dependency_overrides[get_admin_service] = lambda: pytest.fail("unauthorized preview reached service")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/admin/notifications/content-preview",
            json={
                "templateCode": "personal",
                "audience": [{"type": "all"}],
            },
        )
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("content", ["a" * 17000, "中" * 5500], ids=["long-ascii", "long-chinese"])
async def test_personalization_keeps_existing_template_text_limits_and_schema_examples(db_session, content):
    uid = uuid4()
    await TemplateCRUD(db_session).create(
        dict(
            code="long",
            name="Long",
            category="user.mention",
            content_mode="raw",
            title_template="Hello {recipient}",
            content_template=content,
            variable_schema={"recipient": {"type": "string", "required": True, "examples": ["Alice"]}},
            enabled=True,
        )
    )
    profiles = Profiles({uid: UserPublicProfile(id=uid, name="Actual")})
    orch = orchestrator(db_session, profiles)
    cmd = command(
        template_code="long",
        template_variables={},
        variable_bindings={"recipient": {"source": "recipient", "field": "name"}},
    )
    message = await orch.create_message(cmd, created_by=uuid4())

    @asynccontextmanager
    async def factory():
        yield db_session

    preview = await AdminNotificationService(session_factory=factory, query_service=profiles).preview_content(
        template_code=cmd.template_code,
        template_variables=cmd.template_variables,
        variable_bindings=cmd.variable_bindings,
        audience=cmd.audience,
        preview_user_id=uid,
    )
    assert preview.content == content
    await orch.publish_message(message.id)
    row = (await db_session.exec(select(UserNotification))).one()
    assert row.rendered_content["content"] == content
    assert row.rendered_content["title"] == "Hello Actual"


@pytest.mark.asyncio
async def test_personalization_does_not_count_internal_schema_and_binding_wrapper_keys(db_session):
    uid = uuid4()
    names = [f"variable{i}" for i in range(22)]
    await TemplateCRUD(db_session).create(
        dict(
            code="many",
            name="Many",
            category="user.mention",
            content_mode="raw",
            title_template="Hello {variable0}",
            content_template=" ".join("{" + name + "}" for name in names),
            variable_schema={name: {"type": "string"} for name in names},
            enabled=True,
        )
    )
    cmd = command(
        template_code="many",
        template_variables={},
        variable_bindings={name: {"source": "recipient", "field": "name"} for name in names},
    )
    orch = orchestrator(db_session, Profiles({uid: UserPublicProfile(id=uid, name="Actual")}))
    message = await orch.create_message(cmd, created_by=uuid4())
    await orch.publish_message(message.id)
    row = (await db_session.exec(select(UserNotification))).one()
    assert row.rendered_content["content"] == " ".join(["Actual"] * 22)


@pytest.mark.asyncio
async def test_omitted_optional_manual_string_saves_previews_and_publishes_as_empty(db_session):
    uid = uuid4()
    await TemplateCRUD(db_session).create(
        dict(
            code="optional-note",
            name="Optional note",
            category="user.mention",
            content_mode="raw",
            title_template="Hello {recipient}",
            content_template="Optional:{note}|{count}|{flag}",
            variable_schema={
                "recipient": {"type": "string", "required": True},
                "note": {"type": "string"},
                "count": {"type": "integer", "required": True},
                "flag": {"type": "boolean", "required": True},
            },
            enabled=True,
        )
    )
    profiles = Profiles({uid: UserPublicProfile(id=uid, name="Actual")})
    cmd = command(
        template_code="optional-note", variable_bindings={"recipient": {"source": "recipient", "field": "name"}}
    )
    orch = orchestrator(db_session, profiles)
    message = await orch.create_message(cmd, created_by=uuid4())

    @asynccontextmanager
    async def factory():
        yield db_session

    service = AdminNotificationService(session_factory=factory, query_service=profiles)
    preview = await service.preview_content(
        template_code=cmd.template_code,
        template_variables=cmd.template_variables,
        variable_bindings=cmd.variable_bindings,
        audience=cmd.audience,
        preview_user_id=uid,
    )
    assert preview.content == "Optional:|0|False"
    await orch.publish_message(message.id)
    row = (await db_session.exec(select(UserNotification))).one()
    assert row.rendered_content["content"] == preview.content
