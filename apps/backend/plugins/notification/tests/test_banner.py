"""Global banner boundaries, durable transitions, consent and fanout isolation."""

from asyncio import Event, create_task, gather
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import plugin_notification.banner.services as banner_module
import pytest
import pytest_asyncio
from plugin_notification.admin.api import _to_command, list_announcements
from plugin_notification.admin.schemas import AnnouncementCreateRequest, MessageListQuery
from plugin_notification.admin.services import AdminNotificationService
from plugin_notification.banner.schemas import BannerPublishRequest
from plugin_notification.banner.services import BannerAnnouncementService, emit_banner_changed
from plugin_notification.crud import MessageCRUD
from plugin_notification.enums import MessageStatus
from plugin_notification.models import (
    BANNER_STATE_ID,
    NotificationAudience,
    NotificationBannerState,
    NotificationMessage,
    NotificationOutbox,
    NotificationTemplate,
    UserNotification,
)
from plugin_notification.orchestrator import MessageOrchestrator
from plugin_notification.status_codes import NotificationStatusCode
from pydantic import ValidationError
from rapidkit_framework.exceptions import AppException
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

NOW = datetime(2035, 1, 2, 3, 4, 5)
OPERATOR = uuid4()


@pytest_asyncio.fixture
async def banners(db_session, monkeypatch):
    clock = SimpleNamespace(now=NOW)
    monkeypatch.setattr("plugin_notification.banner.services.timezone.now", lambda: clock.now)
    db_session.add(NotificationBannerState(id=BANNER_STATE_ID))
    await db_session.commit()

    @asynccontextmanager
    async def factory():
        try:
            yield db_session
        except BaseException:
            await db_session.rollback()
            raise

    emitter = AsyncMock()
    service = BannerAnnouncementService(factory, broadcaster=emitter)
    return service, db_session, clock, emitter


def body(**kwargs):
    return AnnouncementCreateRequest(
        display_mode="top_banner", raw_title="Banner", raw_content="Shared content", **kwargs
    )


async def save(service, **kwargs):
    request = body(**kwargs)
    return (await service.save(_to_command(request), operator_id=OPERATOR, body=request)).message_id


async def snapshot(service, session):
    return await service.snapshot(session, user=SimpleNamespace(id=uuid4()))


@pytest.mark.asyncio
async def test_empty_banner_reads_need_no_seed_and_do_not_write(db_session):
    service = BannerAnnouncementService()
    public = await snapshot(service, db_session)
    check = await service.snapshot(db_session)
    assert public.current is None and public.revision == 0 and public.next_change_at is None
    assert check.current is None and check.scheduled is None and check.revision == 0
    assert await service.project_changes(db_session) == {}
    assert not db_session.new and not db_session.dirty
    await db_session.commit()
    assert await db_session.get(NotificationBannerState, BANNER_STATE_ID) is None


@pytest.mark.asyncio
async def test_first_banner_write_initializes_in_its_transaction_and_can_retry(db_session):
    service = BannerAnnouncementService(session=db_session, broadcaster=AsyncMock())
    request = body(banner_revision=0, client_request_id=uuid4())
    result = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    state = await db_session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 1 and state.active_message_id == result.message_id
    await db_session.rollback()
    assert await db_session.get(NotificationBannerState, BANNER_STATE_ID) is None
    assert await db_session.get(NotificationMessage, result.message_id) is None

    result = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    await db_session.commit()
    assert (await snapshot(service, db_session)).current.id == result.message_id
    state, _, _ = await service.advance_due(db_session)
    assert state.revision == 1 and state.active_message_id == result.message_id


@pytest.mark.asyncio
async def test_worker_can_initialize_an_unused_banner_slot(db_session):
    service = BannerAnnouncementService()
    state, active, scheduled = await service.advance_due(db_session)
    assert state.revision == 0 and active is None and scheduled is None
    assert not service.transitioned
    await db_session.commit()
    assert await db_session.get(NotificationBannerState, BANNER_STATE_ID) is state


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["published", "scheduled"])
@pytest.mark.parametrize("lock", [False, True])
async def test_missing_state_does_not_hide_existing_live_banners(db_session, status, lock):
    db_session.add(
        NotificationMessage(
            source="admin",
            category="announcement",
            display_mode="top_banner",
            status=status,
            content_mode="raw",
            title="Existing banner",
            content="Content",
            correlation_id="existing",
        )
    )
    await db_session.commit()
    service = BannerAnnouncementService()
    with pytest.raises(AppException) as error:
        if lock:
            await service.advance_due(db_session)
        else:
            await snapshot(service, db_session)
    assert error.value.code == NotificationStatusCode.BANNER_STATE_MISSING.code
    assert await db_session.get(NotificationBannerState, BANNER_STATE_ID) is None


@pytest.mark.asyncio
async def test_concurrent_first_banner_publications_preserve_revision_checks(pg_engine):
    schema = f"banner_init_{uuid4().hex}"
    async with pg_engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
    engine = pg_engine.execution_options(schema_translate_map={None: schema})
    try:
        async with engine.begin() as connection:
            for model in (NotificationMessage, NotificationBannerState):
                await connection.run_sync(model.__table__.create)
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        requests = [body(banner_revision=0, client_request_id=uuid4()) for _ in range(2)]
        results = await gather(
            *(
                BannerAnnouncementService(factory, broadcaster=AsyncMock()).save(
                    _to_command(request), operator_id=OPERATOR, body=request
                )
                for request in requests
            ),
            return_exceptions=True,
        )
        failures = [result for result in results if isinstance(result, BaseException)]
        assert len(failures) == 1
        assert isinstance(failures[0], AppException)
        assert failures[0].code == NotificationStatusCode.BANNER_REVISION_CONFLICT.code
        async with factory() as session:
            states = (await session.exec(select(NotificationBannerState))).all()
            messages = (await session.exec(select(NotificationMessage))).all()
            assert len(states) == len(messages) == 1
            assert states[0].revision == 1 and states[0].active_message_id == messages[0].id
    finally:
        async with pg_engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))


@pytest.mark.parametrize("level", ["info", "success", "warning", "error"])
def test_four_levels_and_banner_omits_audience_channels(level):
    request = body(level=level, channels=[])
    assert request.level == level
    assert request.audience == []
    assert _to_command(request).audience[0].type == "all"


@pytest.mark.parametrize("level", ["danger", "", "INFO", None, 1])
def test_reject_invalid_level(level):
    with pytest.raises(ValidationError):
        body(level=level)


def test_banner_rejects_recipient_bindings_and_mixed_sources():
    with pytest.raises(ValidationError):
        AnnouncementCreateRequest(
            display_mode="top_banner",
            template_code="x",
            variable_bindings={"name": {"source": "recipient", "field": "name"}},
        )
    with pytest.raises(ValidationError):
        body(i18n_key="test.key")
    with pytest.raises(ValidationError):
        AnnouncementCreateRequest(raw_title="x", raw_content="x")


@pytest.mark.asyncio
async def test_draft_no_slot_changes_and_no_fanout(banners):
    service, session, clock, emitter = banners
    message_id = await save(service, save_as_draft=True)
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 0 and state.active_message_id is None
    assert (await session.get(NotificationMessage, message_id)).status == "draft"
    emitter.assert_not_called()
    for model in [NotificationAudience, UserNotification, NotificationOutbox]:
        assert list((await session.exec(select(model))).all()) == []


@pytest.mark.asyncio
async def test_immediate_replace_requires_revision_and_ack_and_preserves_reservation(banners):
    service, session, clock, emitter = banners
    first = await save(service, banner_revision=0)
    future = await save(service, banner_revision=1, replace_current=True, publish_at=NOW + timedelta(hours=1))
    for kwargs, code in [
        ({"banner_revision": 1, "replace_current": True}, NotificationStatusCode.BANNER_REVISION_CONFLICT),
        ({"banner_revision": 2}, NotificationStatusCode.BANNER_REPLACEMENT_REQUIRED),
    ]:
        with pytest.raises(AppException) as error:
            await save(service, **kwargs)
        assert error.value.code == code.code
        assert error.value.data["revision"] == 2
    current = await save(service, banner_revision=2, replace_current=True)
    check = await service.snapshot(session)
    assert check.current.id == current and check.scheduled.id == future
    assert (await session.get(NotificationMessage, first)).superseded_by_id == current
    assert check.revision == 3
    assert len((await session.exec(select(NotificationMessage))).all()) == 3


@pytest.mark.asyncio
async def test_upcoming_replacement_and_cancel_leave_current(banners):
    service, session, clock, emitter = banners
    current = await save(service, banner_revision=0)
    first = await save(service, banner_revision=1, replace_current=True, publish_at=NOW + timedelta(hours=1))
    with pytest.raises(AppException) as error:
        await save(service, banner_revision=2, replace_current=True, publish_at=NOW + timedelta(hours=2))
    assert error.value.code == NotificationStatusCode.BANNER_REPLACEMENT_REQUIRED.code
    second = await save(
        service, banner_revision=2, replace_current=True, replace_scheduled=True, publish_at=NOW + timedelta(hours=2)
    )
    assert (await session.get(NotificationMessage, first)).status == "cancelled"
    await service.remove(second, operator_id=OPERATOR, operation="cancel")
    clock.now += timedelta(hours=3)
    result = await snapshot(service, session)
    assert result.current.id == current
    assert (await service.snapshot(session)).scheduled is None


@pytest.mark.asyncio
async def test_takedown_preserves_schedule_and_never_restores(banners):
    service, session, clock, emitter = banners
    current = await save(service, banner_revision=0)
    future = await save(
        service,
        banner_revision=1,
        replace_current=True,
        publish_at=NOW + timedelta(minutes=1),
        expire_at=NOW + timedelta(minutes=2),
    )
    await service.remove(current, operator_id=OPERATOR, operation="recall")
    assert (await snapshot(service, session)).current is None
    assert (await service.snapshot(session)).scheduled.id == future
    clock.now += timedelta(minutes=1)
    assert (await snapshot(service, session)).current.id == future
    clock.now += timedelta(minutes=1)
    assert (await snapshot(service, session)).current is None
    await service.advance_due(session)
    await session.commit()
    assert (await session.get(NotificationMessage, current)).status == "recalled"
    assert (await session.get(NotificationMessage, future)).status == "expired"


@pytest.mark.asyncio
async def test_delayed_worker_past_entire_window_does_not_restore_old_and_reads_are_pure(banners):
    service, session, clock, emitter = banners
    old = await save(service, banner_revision=0)
    future = await save(
        service,
        banner_revision=1,
        replace_current=True,
        publish_at=NOW + timedelta(seconds=10),
        expire_at=NOW + timedelta(seconds=20),
    )
    clock.now += timedelta(seconds=20)
    result = await snapshot(service, session)
    assert result.current is None and result.revision == 4 and result.next_change_at is None
    assert not session.dirty
    assert (await session.get(NotificationMessage, old)).status == "published"
    assert (await session.get(NotificationMessage, future)).status == "scheduled"
    state, _, _ = await service.advance_due(session)
    await session.commit()
    assert state.revision == result.revision
    assert (await session.get(NotificationMessage, old)).status == "superseded"
    assert (await session.get(NotificationMessage, future)).status == "expired"
    assert (await snapshot(service, session)).current is None


@pytest.mark.asyncio
async def test_half_open_boundaries_and_unlimited_banner(banners):
    service, session, clock, emitter = banners
    first = await save(service, banner_revision=0, expire_at=NOW + timedelta(seconds=10))
    future = await save(
        service,
        banner_revision=1,
        replace_current=True,
        publish_at=NOW + timedelta(seconds=10),
        expire_at=NOW + timedelta(seconds=20),
    )
    clock.now += timedelta(seconds=9)
    result = await snapshot(service, session)
    assert result.current.id == first and result.next_change_at == NOW + timedelta(seconds=10)
    clock.now += timedelta(seconds=1)
    assert (await snapshot(service, session)).current.id == future
    clock.now += timedelta(seconds=10)
    assert (await snapshot(service, session)).current is None
    revision = (await snapshot(service, session)).revision
    infinite = await save(service, banner_revision=revision)
    clock.now += timedelta(days=1000)
    result = await snapshot(service, session)
    assert result.current.id == infinite and result.next_change_at is None
    assert result.model_dump(mode="json", by_alias=True)["serverNow"].endswith("+00:00")


@pytest.mark.asyncio
async def test_scheduled_content_edit_stale_revision_rolls_back_and_cannot_save_draft(banners):
    service, session, clock, emitter = banners
    future = await save(service, banner_revision=0, publish_at=NOW + timedelta(hours=1))
    edit = body(banner_revision=0, publish_at=NOW + timedelta(hours=2))
    edit.raw_title = "Changed"
    with pytest.raises(AppException) as error:
        await service.save(_to_command(edit), operator_id=OPERATOR, body=edit, message_id=future)
    assert error.value.code == NotificationStatusCode.BANNER_REVISION_CONFLICT.code
    record = await session.get(NotificationMessage, future)
    assert record.title == "Banner" and record.publish_at == NOW + timedelta(hours=1)
    edit.banner_revision = 1
    await service.save(_to_command(edit), operator_id=OPERATOR, body=edit, message_id=future)
    assert (await service.snapshot(session)).scheduled.title == "Changed"
    assert (await service.snapshot(session)).revision == 2
    edit.save_as_draft = True
    with pytest.raises(AppException):
        await service.save(_to_command(edit), operator_id=OPERATOR, body=edit, message_id=future)


@pytest.mark.asyncio
async def test_repeat_publish_and_broadcast_failure_keep_durable_snapshot(banners):
    service, session, clock, emitter = banners
    emitter.side_effect = RuntimeError("redis unavailable")
    message_id = await save(service, save_as_draft=True)
    result = await service.publish(message_id, operator_id=OPERATOR, body=BannerPublishRequest(banner_revision=0))
    assert not result.deduplicated
    result = await service.publish(message_id, operator_id=OPERATOR, body=BannerPublishRequest(banner_revision=0))
    assert result.deduplicated
    result = await snapshot(service, session)
    assert result.current.id == message_id and result.revision == 1
    assert list((await session.exec(select(NotificationOutbox))).all()) == []


@pytest.mark.asyncio
async def test_generic_worker_queries_exclude_banners(banners):
    service, session, clock, emitter = banners
    await save(
        service, banner_revision=0, publish_at=NOW + timedelta(seconds=10), expire_at=NOW + timedelta(seconds=20)
    )
    clock.now += timedelta(seconds=10)
    crud = MessageCRUD(session)
    assert await crud.get_due_scheduled(clock.now) == []
    await service.advance_due(session)
    await session.commit()
    clock.now += timedelta(seconds=10)
    assert await crud.get_expired_published(clock.now) == []


@pytest.mark.asyncio
async def test_manual_template_and_localized_content(banners):
    service, session, clock, emitter = banners
    template = NotificationTemplate(
        code="banner",
        name="banner",
        category="admin.announcement",
        content_mode="raw",
        title_template="Hello {name}",
        content_template="Shared {name}",
        variable_schema={"name": {"type": "string", "required": True}},
    )
    session.add(template)
    await session.commit()
    request = AnnouncementCreateRequest(
        display_mode="top_banner", template_code="banner", template_variables={"name": "Team"}, banner_revision=0
    )
    await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    assert (await snapshot(service, session)).current.title == "Hello Team"
    request = AnnouncementCreateRequest(
        display_mode="top_banner",
        banner_revision=1,
        replace_current=True,
        localized_content={
            "defaultLocale": "en-US",
            "translations": {
                "en-US": {"title": "Hello {name}", "content": "Notice"},
                "zh-CN": {"title": "你好 {name}", "content": "公告"},
            },
            "parameters": {"name": "Team"},
        },
    )
    await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    result = await snapshot(service, session)
    assert result.current.content_mode == "local"
    assert result.current.content_params["translations"]["zh-CN"]["title"] == "你好 {name}"


@pytest.mark.asyncio
async def test_schedule_after_current_expiry_needs_no_replacement_consent(banners):
    service, session, clock, emitter = banners
    await save(service, banner_revision=0, expire_at=NOW + timedelta(seconds=10))
    await save(service, banner_revision=1, publish_at=NOW + timedelta(seconds=20))
    assert (await service.snapshot(session)).revision == 2


@pytest.mark.asyncio
async def test_draft_edit_does_not_advance_slot_when_worker_lags(banners):
    service, session, clock, emitter = banners
    draft = await save(service, save_as_draft=True)
    await save(service, banner_revision=0, expire_at=NOW + timedelta(seconds=10))
    clock.now += timedelta(seconds=20)
    request = body(save_as_draft=True)
    await service.save(_to_command(request), operator_id=OPERATOR, body=request, message_id=draft)
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 1 and state.active_message_id is not None
    assert (await snapshot(service, session)).current is None


@pytest.mark.asyncio
async def test_draft_can_switch_modes_but_reserved_banner_cannot(banners):
    service, session, clock, emitter = banners
    admin = AdminNotificationService(service.session_factory, query_service=SimpleNamespace())
    draft = await save(service, save_as_draft=True)
    inbox = AnnouncementCreateRequest(
        raw_title="Inbox", raw_content="Content", audience=[{"type": "all"}], save_as_draft=True
    )
    await admin.update_message(
        draft, _to_command(inbox), operator_id=OPERATOR, publish_at=None, expire_at=None, save_as_draft=True
    )
    assert (await session.get(NotificationMessage, draft)).display_mode == "inbox"
    assert len((await session.exec(select(NotificationAudience))).all()) == 1
    banner = body(save_as_draft=True)
    await service.save(_to_command(banner), operator_id=OPERATOR, body=banner, message_id=draft)
    assert (await session.get(NotificationMessage, draft)).display_mode == "top_banner"
    assert list((await session.exec(select(NotificationAudience))).all()) == []
    banner.save_as_draft = False
    banner.publish_at = NOW + timedelta(hours=1)
    banner.banner_revision = 0
    await service.save(_to_command(banner), operator_id=OPERATOR, body=banner, message_id=draft)
    with pytest.raises(AppException):
        await admin.update_message(
            draft, _to_command(inbox), operator_id=OPERATOR, publish_at=None, expire_at=None, save_as_draft=True
        )


@pytest.mark.asyncio
async def test_due_menu_removed_cannot_block_banner_transition(banners, monkeypatch):
    service, session, clock, emitter = banners
    message_id = await save(service, banner_revision=0, publish_at=NOW + timedelta(seconds=10))
    message = await session.get(NotificationMessage, message_id)
    message.action = {"type": "menu", "menu_id": str(uuid4())}
    session.add(message)
    await session.commit()
    monkeypatch.setattr(
        "plugin_notification.banner.services.resolve_action",
        AsyncMock(side_effect=AppException(NotificationStatusCode.INVALID_ACTION_ROUTE)),
    )
    clock.now += timedelta(seconds=10)
    # Public projection needs a menu provider only when an action remains accessible.
    provider = SimpleNamespace(get_target=AsyncMock(return_value=SimpleNamespace()))
    monkeypatch.setattr("plugin_notification.banner.services.get_service", lambda _: provider)
    result = await snapshot(service, session)
    assert result.current.id == message_id and result.current.action is None
    state, _, _ = await service.advance_due(session)
    await session.commit()
    assert state.active_message_id == message_id
    assert (await session.get(NotificationMessage, message_id)).action is None


@pytest.mark.asyncio
async def test_admin_list_projects_worker_lag_status_before_filter(banners):
    service, session, clock, emitter = banners
    await save(service, banner_revision=0)
    future = await save(service, banner_revision=1, replace_current=True, publish_at=NOW + timedelta(seconds=10))
    clock.now += timedelta(seconds=10)
    response = await list_announcements(
        MessageListQuery(status=MessageStatus.PUBLISHED, display_mode="top_banner"),
        SimpleNamespace(id=OPERATOR),
        MessageCRUD(session),
    )
    assert response.data.total == 1
    assert response.data.records[0].id == future
    assert response.data.records[0].status == MessageStatus.PUBLISHED
    assert not session.dirty


@pytest.mark.asyncio
async def test_unauthorized_menu_action_stripped_but_public_content_survives(banners, monkeypatch):
    service, session, clock, emitter = banners
    message_id = await save(service, banner_revision=0)
    message = await session.get(NotificationMessage, message_id)
    message.action = {"type": "menu", "menu_id": str(uuid4()), "path": "/secret", "route": "secret"}
    session.add(message)
    await session.commit()
    provider = SimpleNamespace(get_target=AsyncMock(return_value=None))
    monkeypatch.setattr("plugin_notification.banner.services.get_service", lambda _: provider)
    result = await snapshot(service, session)
    assert result.current.title == "Banner" and result.current.action is None
    assert message.action["path"] == "/secret"
    assert not session.dirty


@pytest.mark.asyncio
async def test_banner_emitter_targets_authenticated_namespace_room(monkeypatch):
    socket = SimpleNamespace(emit=AsyncMock())
    monkeypatch.setattr("plugin_notification.banner.services.get_external_sio", lambda: socket)
    await emit_banner_changed(7)
    socket.emit.assert_awaited_once_with(
        "announcement:banner_changed", {"revision": 7}, to="announcement:authenticated", namespace="/notifications"
    )


@pytest.mark.asyncio
async def test_inbox_lifecycle_cannot_fanout_banner_after_mode_race(banners):
    service, session, clock, emitter = banners
    message_id = await save(service, save_as_draft=True)
    orchestrator = MessageOrchestrator(session, SimpleNamespace(), SimpleNamespace())
    for operation in [orchestrator.publish_message, orchestrator.cancel_message, orchestrator.delete_message]:
        with pytest.raises(AppException) as error:
            await operation(message_id)
        assert error.value.code == NotificationStatusCode.INVALID_STATE_TRANSITION.code
    assert list((await session.exec(select(NotificationAudience))).all()) == []
    assert list((await session.exec(select(UserNotification))).all()) == []
    assert list((await session.exec(select(NotificationOutbox))).all()) == []


@pytest.mark.asyncio
async def test_create_retry_after_lost_committed_response_deduplicates_before_revision_check(banners):
    service, session, clock, emitter = banners
    request = body(client_request_id=uuid4(), banner_revision=0)
    original = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    retry = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    assert retry.message_id == original.message_id and retry.deduplicated
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 1 and state.active_message_id == original.message_id
    assert len((await session.exec(select(NotificationMessage))).all()) == 1
    assert emitter.await_count == 1
    message = await session.get(NotificationMessage, original.message_id)
    assert message.deduplication_key == f"banner:{OPERATOR}:{request.client_request_id}"
    assert len(message.deduplication_key) <= 256


@pytest.mark.asyncio
async def test_create_retry_never_resurrects_superseded_banner(banners):
    service, session, clock, emitter = banners
    request = body(client_request_id=uuid4(), banner_revision=0)
    original = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    current = await save(service, banner_revision=1, replace_current=True)
    # Rechecking/reconfirming after a lost response still refers to the same attempt.
    request.banner_revision, request.replace_current = 2, True
    retry = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    assert retry.message_id == original.message_id and retry.deduplicated
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 2 and state.active_message_id == current
    assert (await session.get(NotificationMessage, original.message_id)).status == "superseded"
    assert len((await session.exec(select(NotificationMessage))).all()) == 2


@pytest.mark.asyncio
async def test_create_retry_after_missed_window_does_not_advance_or_restore_slot(banners):
    service, session, clock, emitter = banners
    request = body(
        client_request_id=uuid4(),
        banner_revision=0,
        publish_at=NOW + timedelta(seconds=10),
        expire_at=NOW + timedelta(seconds=20),
    )
    original = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    clock.now += timedelta(seconds=30)
    retry = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    assert retry.message_id == original.message_id and retry.deduplicated
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 1 and state.active_message_id is None and state.scheduled_message_id == original.message_id
    assert (await session.get(NotificationMessage, original.message_id)).status == "scheduled"
    assert (await snapshot(service, session)).current is None
    assert emitter.await_count == 1
    assert not session.dirty


@pytest.mark.asyncio
async def test_create_request_nonce_scoped_to_operator_and_drafts_do_not_consume_it(banners):
    service, session, clock, emitter = banners
    nonce = uuid4()
    draft_request = body(client_request_id=nonce, save_as_draft=True)
    draft = await service.save(_to_command(draft_request), operator_id=OPERATOR, body=draft_request)
    assert (await session.get(NotificationMessage, draft.message_id)).deduplication_key is None
    request = body(client_request_id=nonce, banner_revision=0)
    first = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    foreign_operator = uuid4()
    request.banner_revision, request.replace_current = 1, True
    foreign = await service.save(_to_command(request), operator_id=foreign_operator, body=request)
    assert not foreign.deduplicated and foreign.message_id != first.message_id
    assert (await session.get(NotificationMessage, foreign.message_id)).created_by == foreign_operator
    retry = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    assert retry.message_id == first.message_id and retry.deduplicated
    assert (await snapshot(service, session)).current.id == foreign.message_id
    assert len((await session.exec(select(NotificationMessage))).all()) == 3


@pytest.mark.asyncio
async def test_lock_wait_crossing_start_normalizes_before_revision_and_does_not_retroactively_replace(
    banners, monkeypatch
):
    service, session, clock, emitter = banners
    await save(service, banner_revision=0)
    future = await save(service, banner_revision=1, replace_current=True, publish_at=NOW + timedelta(seconds=10))
    clock.now = NOW + timedelta(seconds=9)
    waiting, release = Event(), Event()
    original_load = service._load

    async def blocked_load(session, *, lock=False):
        if lock:
            waiting.set()
            await release.wait()
        return await original_load(session, lock=lock)

    monkeypatch.setattr(service, "_load", blocked_load)
    request = body(banner_revision=2, replace_current=True)
    task = create_task(service.save(_to_command(request), operator_id=OPERATOR, body=request))
    await waiting.wait()
    clock.now = NOW + timedelta(seconds=11)
    release.set()
    with pytest.raises(AppException) as error:
        await task
    assert error.value.code == NotificationStatusCode.BANNER_REVISION_CONFLICT.code
    assert error.value.data["revision"] == 3
    assert error.value.data["current"]["id"] == str(future)
    assert len((await session.exec(select(NotificationMessage))).all()) == 2
    assert (await snapshot(service, session)).current.id == future


@pytest.mark.asyncio
async def test_render_crossing_start_uses_post_lock_publication_instant_consistently(banners, monkeypatch):
    service, session, clock, emitter = banners
    await save(service, banner_revision=0)
    future = await save(service, banner_revision=1, replace_current=True, publish_at=NOW + timedelta(seconds=10))
    clock.now = NOW + timedelta(seconds=9)
    rendering, release = Event(), Event()
    original_resolve = banner_module.resolve_content

    async def blocked_resolve(session, command):
        rendering.set()
        await release.wait()
        return await original_resolve(session, command)

    monkeypatch.setattr(banner_module, "resolve_content", blocked_resolve)
    request = body(banner_revision=2, replace_current=True)
    task = create_task(service.save(_to_command(request), operator_id=OPERATOR, body=request))
    await rendering.wait()
    clock.now = NOW + timedelta(seconds=11)
    release.set()
    result = await task
    current = await session.get(NotificationMessage, result.message_id)
    pending = await session.get(NotificationMessage, future)
    assert current.published_at == NOW + timedelta(seconds=9)
    assert current.published_at < pending.publish_at
    assert (await snapshot(service, session)).current.id == future
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 3 and state.scheduled_message_id == future


@pytest.mark.parametrize("move_start", [False, True])
@pytest.mark.asyncio
async def test_scheduled_edit_rendering_across_original_start_cannot_rewrite_effective_content(
    banners, monkeypatch, move_start
):
    service, session, clock, emitter = banners
    future = await save(service, banner_revision=0, publish_at=NOW + timedelta(seconds=10))
    clock.now = NOW + timedelta(seconds=9)
    rendering, release = Event(), Event()
    original_resolve = banner_module.resolve_content

    async def blocked_resolve(session, command):
        rendering.set()
        await release.wait()
        return await original_resolve(session, command)

    monkeypatch.setattr(banner_module, "resolve_content", blocked_resolve)
    request = body(banner_revision=1, publish_at=NOW + timedelta(seconds=20 if move_start else 10))
    request.raw_title = "Edited after effective start"
    task = create_task(service.save(_to_command(request), operator_id=OPERATOR, body=request, message_id=future))
    await rendering.wait()
    clock.now = NOW + timedelta(seconds=11)
    release.set()
    with pytest.raises(AppException) as error:
        await task
    assert error.value.code == NotificationStatusCode.INVALID_STATE_TRANSITION.code
    result = await snapshot(service, session)
    assert result.current.id == future and result.current.title == "Banner"
    assert result.current.publish_at == NOW + timedelta(seconds=10)
    assert (await session.get(NotificationMessage, future)).title == "Banner"


@pytest.mark.asyncio
async def test_request_banner_write_defers_broadcast_and_supports_rollback(banners):

    _, session, _, emitter = banners
    service = BannerAnnouncementService(session=session, broadcaster=emitter)
    request = body(banner_revision=0)
    result = await service.save(_to_command(request), operator_id=OPERATOR, body=request)
    assert await MessageCRUD(session).get(result.message_id) is not None
    assert emitter.await_count == 0
    await session.rollback()
    assert await MessageCRUD(session).get(result.message_id) is None
    state = await session.get(NotificationBannerState, BANNER_STATE_ID)
    assert state.revision == 0
    assert emitter.await_count == 0
