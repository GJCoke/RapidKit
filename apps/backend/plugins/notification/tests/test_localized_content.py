"""Localized announcement boundaries and persisted delivery envelopes."""

from contextlib import asynccontextmanager
from copy import deepcopy
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_notification.admin_api import _to_command, router
from plugin_notification.admin_deps import get_admin_service, get_message_crud
from plugin_notification.admin_schemas import AnnouncementCreateRequest
from plugin_notification.admin_service import AdminNotificationService
from plugin_notification.api import list_notifications
from plugin_notification.audience import AudienceResolver
from plugin_notification.channels import ChannelRegistry
from plugin_notification.crud import MessageCRUD, UserNotificationCRUD
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.preference import PreferenceResolver
from plugin_notification.schemas import InboxListQuery
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.worker import DeliveryWorker
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_framework.exceptions import AppException


def _envelope():
    return {
        "defaultLocale": "zh-CN",
        "translations": {
            "zh-CN": {"title": "维护 {count}", "content": "启用：{enabled}，{name}"},
            "en-US": {"title": "Maintenance {count}", "content": "Enabled: {enabled}, {name}"},
        },
        "parameters": {"count": 0, "enabled": False, "name": "Team"},
    }


def _command(envelope=None, **kwargs):
    return NotificationCommand(
        source="admin",
        category="admin.announcement",
        localized_content=envelope if envelope is not None else _envelope(),
        audience=[AudienceRule(type="all")],
        **kwargs,
    )


class _QueryService:
    def __init__(self, user_id):
        self.user_id = user_id

    async def get_active_user_ids(self, user_ids):
        return list(user_ids)

    async def get_active_user_ids_by_role(self, role_code):
        return []

    async def get_active_user_ids_by_department(self, department_id, include_descendants=False):
        return []

    async def get_all_active_user_ids(self):
        return [self.user_id]


def _orchestrator(session):
    return MessageOrchestrator(
        session=session,
        audience_resolver=AudienceResolver(query_service=cast(UserQueryService, _QueryService(uuid4()))),
        preference_resolver=PreferenceResolver(session=session),
    )


def test_localized_command_preserves_scalar_types_and_camel_case_envelope():
    command = _command()
    assert command.content_mode == "local"
    assert command.localized_content.model_dump(mode="json", by_alias=True) == _envelope()
    assert type(command.localized_content.parameters["count"]) is int
    assert command.localized_content.parameters["enabled"] is False
    request = AnnouncementCreateRequest.model_validate({"localizedContent": _envelope(), "audience": [{"type": "all"}]})
    assert _to_command(request).localized_content == command.localized_content


@pytest.mark.parametrize(
    "source",
    [{"raw_title": "Title", "raw_content": "Body"}, {"i18n_key": "ops.notice"}, {"template_code": "ops.notice"}],
)
def test_localized_content_is_exclusive_with_other_sources(source):
    with pytest.raises(ValueError, match="mutually exclusive"):
        _command(**source)


@pytest.mark.parametrize("locale", ["fr-FR", "zh", "en"])
def test_localized_content_rejects_unsupported_default_and_translation_locales(locale):
    envelope = _envelope()
    envelope["defaultLocale"] = locale
    with pytest.raises(ValueError):
        _command(envelope)
    envelope = _envelope()
    envelope["translations"][locale] = {"title": "Title", "content": "Body"}
    with pytest.raises(ValueError):
        _command(envelope)


@pytest.mark.parametrize("translation", [{}, {"title": " "}, {"content": "Body"}, {"title": "Title", "content": "  "}])
def test_default_locale_requires_both_nonblank_fields(translation):
    envelope = _envelope()
    envelope["translations"]["zh-CN"] = translation
    with pytest.raises(ValueError):
        _command(envelope)


def test_blank_optional_translation_is_omitted_but_partial_is_rejected():
    envelope = _envelope()
    envelope["translations"]["en-US"] = {"title": "  ", "content": "\n"}
    command = _command(envelope)
    assert set(command.localized_content.translations) == {"zh-CN"}
    envelope["translations"]["en-US"]["content"] = "Body"
    with pytest.raises(ValueError):
        _command(envelope)


def test_default_locale_must_be_present():
    envelope = _envelope()
    del envelope["translations"]["zh-CN"]
    with pytest.raises(ValueError):
        _command(envelope)


@pytest.mark.parametrize("value", [None, [], {}, float("inf"), float("-inf"), float("nan")])
def test_localized_parameters_require_strict_finite_scalars(value):
    envelope = _envelope()
    envelope["parameters"]["name"] = value
    with pytest.raises(ValueError):
        _command(envelope)


@pytest.mark.parametrize("name", ["a.b", "2name", "name-name", "名字", ""])
def test_localized_parameter_names_are_ascii_identifiers(name):
    envelope = _envelope()
    envelope["parameters"][name] = "x"
    with pytest.raises(ValueError):
        _command(envelope)


def test_missing_parameters_are_collected_across_all_languages():
    envelope = _envelope()
    envelope["translations"]["en-US"]["content"] = "{englishOnly} {secondMissing}"
    with pytest.raises(ValueError) as exc:
        _command(envelope)
    assert "englishOnly" in str(exc.value)
    assert "secondMissing" in str(exc.value)


@pytest.mark.parametrize("value", ["", " \n"])
def test_referenced_string_parameters_must_not_be_blank(value):
    envelope = _envelope()
    envelope["parameters"]["name"] = value
    with pytest.raises(ValueError, match="missing localized parameters: name"):
        _command(envelope)


@pytest.mark.parametrize(
    "value,expected",
    [(1.0, "1"), (1.5, "1.5"), (-0.0, "0"), (1e-6, "0.000001"), (1e-7, "1e-7"), (1e21, "1e+21")],
)
def test_numeric_rendering_matches_browser_scalar_strings(value, expected):
    envelope = _envelope()
    envelope["parameters"]["count"] = value
    title, _ = _command(envelope).localized_content.render("zh-CN")
    assert title == f"维护 {expected}"


@pytest.mark.parametrize(
    "source",
    [
        {"rawTitle": "Title", "rawContent": "Body"},
        {"i18NKey": "ops.notice"},
        {"templateCode": "ops.notice"},
    ],
)
def test_admin_request_rejects_mixed_localized_sources_before_entering_route(source):
    with pytest.raises(ValueError, match="mutually exclusive"):
        AnnouncementCreateRequest.model_validate(
            {"localizedContent": _envelope(), "audience": [{"type": "all"}], **source}
        )


@pytest.mark.asyncio
async def test_rendering_is_literal_single_pass_and_keeps_other_braces(db_session):
    envelope = _envelope()
    envelope["translations"]["zh-CN"]["content"] = "{name} {a.b} {x[0]} {count + 1} {未识别} {enabled}"
    envelope["parameters"]["name"] = r"\1 {count}"
    rendered, template_id, config = await _orchestrator(db_session)._resolve_content(_command(envelope))
    assert rendered.content == r"\1 {count} {a.b} {x[0]} {count + 1} {未识别} false"
    assert rendered.title == "维护 0"
    assert rendered.content_mode == "local"
    assert rendered.content_format == "plain_text"
    assert rendered.content_params == envelope
    assert template_id is None and config is None


@pytest.mark.asyncio
@pytest.mark.parametrize("locale", ["zh-CN", "en-US"])
@pytest.mark.parametrize("field", ["title", "content"])
@pytest.mark.parametrize("substitute", [False, True])
async def test_html_is_rejected_in_every_locale_before_and_after_substitution(db_session, locale, field, substitute):
    envelope = _envelope()
    if substitute:
        envelope["translations"][locale][field] = "{unsafe}"
        envelope["parameters"]["unsafe"] = "<script>alert(1)</script>"
    else:
        envelope["translations"][locale][field] = "<b>Unsafe</b>"
    with pytest.raises(AppException) as exc:
        await _orchestrator(db_session)._resolve_content(_command(envelope))
    assert exc.value.status_code_enum is NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED


@pytest.mark.parametrize("field,length", [("title", 257), ("content", 20_001)])
def test_localized_source_length_limits(field, length):
    envelope = _envelope()
    envelope["translations"]["en-US"][field] = "x" * length
    with pytest.raises(ValueError):
        _command(envelope)


@pytest.mark.asyncio
@pytest.mark.parametrize("field,length", [("title", 257), ("content", 20_001)])
async def test_localized_rendered_length_limits_apply_to_optional_languages(db_session, field, length):
    envelope = _envelope()
    # Repetition exceeds the rendered body limit while staying below JSON's byte limit.
    envelope["translations"]["en-US"][field] = "{long}{long}" if field == "content" else "{long}"
    envelope["parameters"]["long"] = "x" * (length // 2 + 1 if field == "content" else length)
    with pytest.raises((ValueError, AppException)):
        await _orchestrator(db_session)._resolve_content(_command(envelope))


@pytest.mark.asyncio
@pytest.mark.parametrize("oversize", ["bytes", "keys"])
async def test_localized_envelope_has_existing_json_bounds(db_session, oversize):
    envelope = _envelope()
    if oversize == "bytes":
        envelope["translations"]["en-US"]["content"] = "x" * 17_000
    else:
        envelope["parameters"].update({f"unused{i}": i for i in range(65)})
    with pytest.raises(AppException) as exc:
        await _orchestrator(db_session)._resolve_content(_command(envelope))
    assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND


@pytest.mark.asyncio
async def test_admin_create_edit_publish_inbox_and_socket_preserve_all_locales(db_session):
    class _User:
        id = uuid4()
        is_admin = True
        roles = []
        department_id = None

    user = _User()

    @asynccontextmanager
    async def session_factory():
        yield db_session

    service = AdminNotificationService(
        session_factory=session_factory,
        query_service=cast(UserQueryService, _QueryService(user.id)),
        enqueue_delivery=lambda: None,
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[verify_user_permission] = lambda: user
    app.dependency_overrides[get_admin_service] = lambda: service
    app.dependency_overrides[get_message_crud] = lambda: MessageCRUD(db_session)
    payload = {"localizedContent": _envelope(), "audience": [{"type": "all"}], "saveAsDraft": True}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post("/admin/notifications", json=payload)
        assert created.status_code == 200
        message_id = UUID(created.json()["data"]["messageId"])
        db_session.expunge_all()
        detail = (await client.get(f"/admin/notifications/{message_id}")).json()["data"]
        assert detail["contentMode"] == "local"
        assert detail["title"] == "维护 0"
        assert detail["contentParams"] == payload["localizedContent"]
        assert (await client.get("/admin/notifications")).json()["data"]["records"][0]["title"] == "维护 0"

        edited = deepcopy(payload["localizedContent"])
        edited["defaultLocale"] = "en-US"
        edited["parameters"]["name"] = "Updated"
        payload["localizedContent"] = edited
        updated = await client.put(f"/admin/notifications/{message_id}", json=payload)
        assert updated.status_code == 200
        assert updated.json()["data"]["contentParams"] == edited
        assert updated.json()["data"]["title"] == "Maintenance 0"
        published = await client.post(f"/admin/notifications/{message_id}/publish")
        assert published.status_code == 200
        assert published.json()["data"]["recipientCount"] == 1

    db_session.expunge_all()
    inbox = await list_notifications(query=InboxListQuery(), user=user, crud=UserNotificationCRUD(db_session))
    item = inbox.data.items[0].model_dump(mode="json", by_alias=True)
    assert item["contentMode"] == "local"
    assert item["title"] == "Maintenance 0"
    assert item["content"] == "Enabled: false, Updated"
    assert item["contentParams"] == edited
    worker = DeliveryWorker(session=db_session, redis=None, registry=ChannelRegistry(), worker_id="test")
    socket_payload = await worker._build_payload(message_id, user.id)
    assert socket_payload["contentMode"] == "local"
    assert socket_payload["contentParams"] == edited
