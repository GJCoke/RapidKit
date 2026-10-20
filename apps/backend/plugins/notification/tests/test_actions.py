"""Isolated menu action validation and immutable publication snapshots."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from plugin_notification.actions import resolve_action
from plugin_notification.admin import api as admin_api
from plugin_notification.admin.schemas import ActionIn, AnnouncementCreateRequest
from plugin_notification.audience import AudienceResolver
from plugin_notification.crud import MessageCRUD
from plugin_notification.models import NotificationMessage, NotificationOutbox, UserNotification
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference.services import PreferenceResolver
from plugin_notification.validation import validate_action
from pydantic import ValidationError
from rapidkit_common.access import access_guard_dependency
from rapidkit_common.access_testing import allow_access
from rapidkit_common.auth import _get_current_user_placeholder
from rapidkit_common.deps import get_async_session
from rapidkit_common.protocols.menu import ActionParameter, ActionTarget
from rapidkit_common.protocols.notification import AudienceRule, NotificationAction, NotificationCommand
from rapidkit_framework.exceptions import AppException
from sqlmodel import select


class Targets:
    def __init__(self):
        self.target = ActionTarget(
            menu_id=uuid4(),
            label="Detail",
            breadcrumb=["Users", "Detail"],
            route="example_detail",
            path="/users/:id",
            parameters=[
                ActionParameter(name="id", location="path", required=True),
                ActionParameter(name="tab", location="query", required=False, default_value="profile"),
            ],
        )
        self.enabled = True
        self.authorized = True

    async def get_target(self, session, menu_id, user=None):
        return (
            self.target
            if self.enabled and (user is None or self.authorized) and menu_id == self.target.menu_id
            else None
        )


def action(targets, **overrides):
    return {
        "type": "menu",
        "menu_id": str(targets.target.menu_id),
        "params": {"id": "a/b ?中"},
        "query": {},
        "label": "Open",
        **overrides,
    }


LOCALIZED_LABEL = {"defaultLocale": "zh-CN", "translations": {"zh-CN": "查看详情", "en-US": "View details"}}


def test_localized_action_label_survives_admin_to_command_conversion():
    incoming = ActionIn.model_validate(
        {"type": "external", "url": "https://example.com", "localizedLabel": LOCALIZED_LABEL}
    )
    command = NotificationAction.model_validate(incoming.model_dump())
    assert command.model_dump(mode="json")["localized_label"]["translations"] == LOCALIZED_LABEL["translations"]
    assert incoming.model_dump(by_alias=True)["localizedLabel"] == LOCALIZED_LABEL


@pytest.mark.parametrize(
    "envelope",
    [
        {"defaultLocale": "fr-FR", "translations": {"fr-FR": "Ouvrir"}},
        {"defaultLocale": "zh-CN", "translations": {"en-US": "Open"}},
        {"defaultLocale": "zh-CN", "translations": {"zh-CN": "  "}},
        {"defaultLocale": "zh-CN", "translations": {"zh-CN": "打开", "fr-FR": "Ouvrir"}},
        {"defaultLocale": "zh-CN", "translations": {"zh-CN": "字" * 65}},
        {"defaultLocale": "zh-CN", "translations": {"zh-CN": "打开", "en-US": "a" * 65}},
        {"defaultLocale": "zh-CN", "translations": {"zh-CN": 12}},
    ],
)
def test_localized_action_label_rejects_invalid_envelopes_in_requests_and_raw_actions(envelope):
    with pytest.raises(ValidationError):
        ActionIn.model_validate({"type": "external", "url": "https://example.com", "localizedLabel": envelope})
    with pytest.raises(AppException):
        validate_action({"type": "external", "url": "https://example.com", "localized_label": envelope})


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["menu", "external", "legacy"])
async def test_resolved_actions_keep_translations_and_a_compatible_default_label(kind):
    targets = Targets()
    value = action(targets, localized_label=LOCALIZED_LABEL)
    if kind == "external":
        value = {"type": "external", "url": "https://example.com", "localized_label": LOCALIZED_LABEL}
    elif kind == "legacy":
        value = {"route": "home", "params": {}, "localized_label": LOCALIZED_LABEL}
    for snapshot in (False, True):
        result = await resolve_action(value, session=None, provider=targets, snapshot=snapshot)
        assert result["localized_label"] == LOCALIZED_LABEL
        assert result["label"] == "查看详情"


@pytest.mark.asyncio
async def test_localized_action_label_is_preserved_when_draft_is_published(db_session):
    targets = Targets()

    class Users:
        async def get_active_user_ids(self, ids):
            return ids

        async def get_all_active_user_ids(self):
            return [uuid4()]

    orchestrator = MessageOrchestrator(
        db_session, AudienceResolver(Users()), PreferenceResolver(db_session), menu_provider=targets
    )
    message = await orchestrator.create_message(
        NotificationCommand(
            source="admin",
            category="admin.announcement",
            raw_title="Title",
            raw_content="Body",
            audience=[AudienceRule(type="all")],
            action=NotificationAction(**action(targets, localized_label=LOCALIZED_LABEL)),
        ),
        created_by=uuid4(),
    )
    assert message.action["localized_label"] == LOCALIZED_LABEL
    await orchestrator.publish_message(message.id)
    stored = await MessageCRUD(db_session).get(message.id)
    assert stored.action["localized_label"] == LOCALIZED_LABEL
    assert stored.action["label"] == "查看详情"


@pytest.mark.asyncio
async def test_menu_action_resolves_encoded_path_and_defaults():
    targets = Targets()
    result = await resolve_action(action(targets), session=None, provider=targets, user=SimpleNamespace())
    assert result["path"] == "/users/a%2Fb%20%3F%E4%B8%AD"
    assert result["query"] == {"tab": "profile"}
    assert result["route"] == "example_detail"


@pytest.mark.asyncio
@pytest.mark.parametrize("params, expected", [({"id": True}, "true"), ({}, "default-user")])
async def test_menu_snapshot_keeps_the_resolved_path_parameters(params, expected):
    targets = Targets()
    targets.target.parameters[0].default_value = "default-user"
    result = await resolve_action(action(targets, params=params), session=None, provider=targets)
    assert result["params"] == {"id": expected}
    assert result["path"] == f"/users/{expected}"


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["disabled", "unauthorized", "missing", "extra_path", "extra_query", "dot_segment"])
async def test_menu_action_rejects_invalid_targets_or_parameters(case):
    targets = Targets()
    value = action(targets)
    if case == "disabled":
        targets.enabled = False
    elif case == "unauthorized":
        targets.authorized = False
    elif case == "missing":
        value["params"] = {}
    elif case == "extra_path":
        value["params"]["other"] = "bad"
    elif case == "dot_segment":
        value["params"] = {"id": ".."}
    else:
        value["query"] = {"next": "https://evil.test"}
    with pytest.raises(AppException):
        await resolve_action(value, session=None, provider=targets, user=SimpleNamespace())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "//evil.test",
        "https://user:pass@example.com",
        "https://",
        "https://exa mple.com",
        "https://example.com\n.evil.test",
        "https://example.com:bad",
        "https://example.com\\@evil.test",
        "https://example.com/path\u0085bad",
    ],
)
async def test_external_action_rejects_dangerous_urls(url):
    with pytest.raises(AppException):
        await resolve_action({"type": "external", "url": url}, session=None)


@pytest.mark.asyncio
async def test_external_and_legacy_actions_remain_supported():
    assert (await resolve_action({"type": "external", "url": "https://example.com/a?q=1"}, session=None))[
        "url"
    ] == "https://example.com/a?q=1"
    assert await resolve_action({"route": "home", "params": {}}, session=None) == {"route": "home", "params": {}}
    with pytest.raises(AppException):
        await resolve_action({"route": "example_detail", "params": {}}, session=None)


@pytest.mark.asyncio
async def test_draft_keeps_binding_and_publish_resolves_latest_menu_snapshot(db_session):
    targets = Targets()

    class Users:
        async def get_active_user_ids(self, ids):
            return ids

        async def get_all_active_user_ids(self):
            return [uuid4()]

    orchestrator = MessageOrchestrator(
        db_session, AudienceResolver(Users()), PreferenceResolver(db_session), menu_provider=targets
    )
    message = await orchestrator.create_message(
        NotificationCommand(
            source="admin",
            category="admin.announcement",
            raw_title="Title",
            raw_content="Body",
            audience=[AudienceRule(type="all")],
            action=NotificationAction(**action(targets)),
        ),
        created_by=uuid4(),
    )
    assert message.action == action(targets)
    targets.target.path = "/people/:id"
    targets.target.route = "people_detail"
    await orchestrator.publish_message(message.id)
    stored = await MessageCRUD(db_session).get(message.id)
    assert stored.action["path"].startswith("/people/a%2Fb")
    assert stored.action["route"] == "people_detail"
    targets.target.path = "/changed/:id"
    assert stored.action["path"].startswith("/people/")


@pytest.mark.asyncio
async def test_disabled_menu_blocks_publication_before_fanout(db_session):
    targets = Targets()
    orchestrator = MessageOrchestrator(
        db_session, AudienceResolver(SimpleNamespace()), PreferenceResolver(db_session), menu_provider=targets
    )
    message = await orchestrator.create_message(
        NotificationCommand(
            source="admin",
            category="admin.announcement",
            raw_title="Title",
            raw_content="Body",
            audience=[AudienceRule(type="all")],
            action=NotificationAction(**action(targets)),
        ),
        created_by=uuid4(),
    )
    targets.enabled = False
    with pytest.raises(AppException):
        await orchestrator.publish_message(message.id)
    assert message.status == "draft"


@pytest.mark.asyncio
async def test_action_preview_http_contract_is_camel_case_and_read_only(db_session, monkeypatch):

    targets = Targets()
    targets.target.route = "example_detail"

    async def list_targets(session, user):
        return [targets.target] if targets.authorized else []

    targets.list_targets = list_targets
    monkeypatch.setattr(admin_api, "get_service", lambda contract: targets)
    monkeypatch.setattr("plugin_notification.actions.get_service", lambda contract: targets)
    app = FastAPI()
    app.include_router(admin_api.router)
    user = SimpleNamespace(id=uuid4(), is_admin=False, roles=[])
    app.dependency_overrides[access_guard_dependency] = allow_access(user)
    app.dependency_overrides[_get_current_user_placeholder] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listing = await client.get("/admin/notifications/action-targets")
        assert listing.status_code == 200
        assert listing.json()["data"][0]["menuId"] == str(targets.target.menu_id)
        assert listing.json()["data"][0]["parameters"][1]["defaultValue"] == "profile"
        preview = await client.post(
            "/admin/notifications/action-preview",
            json={
                "type": "menu",
                "menuId": str(targets.target.menu_id),
                "params": {"id": "abc"},
                "localizedLabel": LOCALIZED_LABEL,
            },
        )
        assert preview.status_code == 200
        assert preview.json()["data"]["route"] == "example_detail"
        assert preview.json()["data"]["path"] == "/users/abc"
        assert preview.json()["data"]["query"] == {"tab": "profile"}
        assert preview.json()["data"]["localizedLabel"] == LOCALIZED_LABEL
        assert preview.json()["data"]["label"] == "查看详情"
    for model in (NotificationMessage, NotificationOutbox, UserNotification):
        assert (await db_session.exec(select(model))).all() == []


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "update"])
async def test_save_rejects_unauthorized_menu_before_service_write(operation, db_session, monkeypatch):

    targets = Targets()
    targets.authorized = False
    monkeypatch.setattr("plugin_notification.actions.get_service", lambda contract: targets)
    body = AnnouncementCreateRequest(
        raw_title="Title", raw_content="Body", audience=[{"type": "all"}], action=action(targets)
    )
    # No write-capable service is supplied: the action check must reject first.
    kwargs = {
        "body": body,
        "current_user": SimpleNamespace(id=uuid4()),
        "service": None,
        "session": db_session,
        "request": Request({"type": "http"}),
    }
    with pytest.raises(AppException):
        if operation == "create":
            await admin_api.create_announcement(**kwargs)
        else:
            await admin_api.update_announcement(message_id=uuid4(), **kwargs)


@pytest.mark.asyncio
async def test_process_resolves_menu_snapshot_immediately(db_session):
    targets = Targets()

    class Users:
        async def get_active_user_ids(self, ids):
            return ids

        async def get_all_active_user_ids(self):
            return []

    orchestrator = MessageOrchestrator(
        db_session, AudienceResolver(Users()), PreferenceResolver(db_session), menu_provider=targets
    )
    result = await orchestrator.process(
        NotificationCommand(
            source="admin",
            category="admin.announcement",
            raw_title="Title",
            raw_content="Body",
            audience=[AudienceRule(type="all")],
            action=NotificationAction(**action(targets)),
        )
    )
    stored = await MessageCRUD(db_session).get(result.message_id)
    assert stored.action["path"].startswith("/users/a%2Fb")
    assert stored.action["query"] == {"tab": "profile"}


@pytest.mark.asyncio
async def test_query_empty_default_and_override_are_preserved():
    targets = Targets()
    targets.target.parameters[1].default_value = ""
    default = await resolve_action(action(targets), session=None, provider=targets)
    assert default["query"] == {"tab": ""}
    override = await resolve_action(action(targets, query={"tab": "activity"}), session=None, provider=targets)
    assert override["query"] == {"tab": "activity"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("template", "params", "expected"),
    [
        ("/foo/:id?", {}, "/foo"),
        ("/foo/:id?", {"id": ""}, "/foo"),
        ("/foo/:id?/edit", {}, "/foo/edit"),
        ("/:id?", {}, "/"),
        ("/foo/:id?/", {}, "/foo/"),
        ("/foo/prefix-:id?", {}, "/foo/prefix-"),
        ("/foo/:id?", {"id": "a/b"}, "/foo/a%2Fb"),
        ("/foo/:id*", {}, "/foo"),
        ("/foo/:id+", {"id": "a/b"}, "/foo/a%2Fb"),
        (r"/foo/:id(\d+)?", {}, "/foo"),
    ],
)
async def test_optional_path_parameter_omits_its_empty_segment(template, params, expected):
    targets = Targets()
    targets.target.path = template
    targets.target.parameters[0].required = False
    resolved = await resolve_action(action(targets, params=params), session=None, provider=targets)
    assert resolved["path"] == expected
