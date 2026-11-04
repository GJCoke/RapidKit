from contextlib import asynccontextmanager
from datetime import timedelta
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_notification.models import (
    NotificationMessage,
    NotificationOutbox,
    NotificationBannerState,
    BANNER_STATE_ID,
)
from plugin_notification.crud import MessageCRUD, OutboxCRUD
from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from tests.testing.utils import one_event


async def message(session, **values):
    row = NotificationMessage(
        **{
            "source": "admin",
            "category": "admin.announcement",
            "content_mode": "raw",
            "title": "private-title",
            "content": "private-content",
            "content_format": "plain_text",
            "status": "published",
            "correlation_id": uuid4().hex,
            **values,
        }
    )
    session.add(row)
    await session.flush()
    return row


@asynccontextmanager
async def scope(session):
    yield session


@pytest.mark.parametrize(
    "reason",
    ["message_missing", "message_not_published", "message_expired", "recipient_inbox_missing", "message_recalled"],
)
async def test_delivery_cancel(reason, db_session, monkeypatch, json_log):
    from plugin_notification.worker import DeliveryWorker
    from plugin_notification.channels import ChannelRegistry, InAppChannel

    msg = (
        None
        if reason == "message_missing"
        else await message(
            db_session,
            status="draft" if reason == "message_not_published" else "published",
            expire_at=timezone.now() - timedelta(seconds=1) if reason == "message_expired" else None,
        )
    )
    mid = msg.id if msg else uuid4()
    row = NotificationOutbox(
        message_id=mid,
        user_id=uuid4(),
        channel="in_app",
        status="pending",
        idempotency_key=uuid4().hex,
        attempt_count=0,
    )
    db_session.add(row)
    await db_session.flush()
    registry = ChannelRegistry()
    registry.register("in_app", InAppChannel())
    worker = DeliveryWorker(db_session, None, registry, "test")
    if reason == "message_recalled":
        monkeypatch.setattr(worker, "_build_payload", AsyncMock(return_value={"status": "recalled"}))
    assert await worker.run_once() == 1
    assert row.status == "cancelled"
    log = one_event(json_log(), "notification.delivery.skipped")
    assert (log["level"], log["outcome"], log["reason_code"], log["message_id"], log["outbox_id"]) == (
        "INFO",
        "skipped",
        reason,
        str(mid),
        str(row.id),
    )
    assert "private-" not in str(json_log())


async def test_empty_audience(db_session, json_log):
    from plugin_notification.orchestrator import MessageOrchestrator

    msg = await message(db_session)
    orchestrator = MessageOrchestrator(
        db_session, NS(resolve=AsyncMock(return_value=[])), NS(filter_allowed=AsyncMock(return_value=[]))
    )
    assert await orchestrator._fanout(msg, [], allow_empty=True) == 0
    row = one_event(json_log(), "notification.message.skipped")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "INFO",
        "skipped",
        "empty_audience",
        str(msg.id),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("race", [False, True])
async def test_message_dedup_once(race, db_session, monkeypatch, json_log):
    from plugin_notification.services import NotificationService

    winner = await message(db_session, deduplication_key="key")
    original = MessageCRUD.get_by_source_dedup
    first = True

    async def lookup(self, source, key):
        nonlocal first
        if race and first:
            first = False
            return None
        return await original(self, source, key)

    monkeypatch.setattr(MessageCRUD, "get_by_source_dedup", lookup)
    service = NotificationService(lambda: scope(db_session), query_service=NS(), enqueue_delivery=lambda: None)
    result = await service.send(
        NotificationCommand(
            source="admin",
            category="admin.announcement",
            raw_title="private-title",
            raw_content="private-content",
            deduplication_key="key",
            audience=[AudienceRule(type="all")],
        )
    )
    assert result.deduplicated and result.message_id == winner.id
    row = one_event(json_log(), "notification.message.deduplicated")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "INFO",
        "deduplicated",
        "dedup_race" if race else "duplicate_deduplication_key",
        str(winner.id),
    )
    assert not [r for r in json_log() if r["message"].startswith("Notification sent:")]
    assert "private-" not in str(json_log())


async def test_no_preference_session(json_log):
    from plugin_notification.preference.services import PreferenceResolver

    uid = uuid4()
    assert await PreferenceResolver().filter_allowed([uid], category="user.invited", mandatory=False) == [uid]
    row = one_event(json_log(), "notification.preference.degraded")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("WARNING", "degraded", "preference_no_session")
    assert "private-" not in str(json_log())


async def test_audience_filter_summary(json_log):
    from plugin_notification.audience import AudienceResolver

    query = NS(get_active_user_ids=AsyncMock(return_value=[]))
    assert (
        await AudienceResolver(query).resolve(
            [
                AudienceRule(type="user", value=str(uuid4())),
                AudienceRule.model_construct(type="user", value=None),
                AudienceRule.model_construct(type="role", value=None),
                AudienceRule.model_construct(type="department", value=None),
            ]
        )
        == []
    )
    records = [r for r in json_log() if r.get("event") == "notification.audience.filtered"]
    assert len(records) == 2
    for reason, count in [("audience_rule_empty_value", 3), ("recipient_inactive", 1)]:
        row = one_event([r for r in records if r["reason_code"] == reason], "notification.audience.filtered")
        assert (row["level"], row["outcome"], row["filtered_count"]) == ("INFO", "filtered", count)
    assert "private-" not in str(json_log())


async def test_retry_ineligible(db_session, json_log):
    msg = await message(db_session, status="draft")
    assert await OutboxCRUD(db_session).retry_failed(msg.id) == 0
    row = one_event(json_log(), "notification.retry.skipped")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "INFO",
        "skipped",
        "message_not_retryable",
        str(msg.id),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("kind", ["nonce", "published"])
async def test_banner_dedup(kind, db_session, json_log):
    from plugin_notification.banner.services import BannerAnnouncementService
    from plugin_notification.admin.api import _to_command
    from plugin_notification.admin.schemas import AnnouncementCreateRequest
    from plugin_notification.banner.schemas import BannerPublishRequest

    operator = uuid4()
    service = BannerAnnouncementService(session=db_session, broadcaster=AsyncMock())
    body = AnnouncementCreateRequest(
        display_mode="top_banner",
        raw_title="private-title",
        raw_content="private-content",
        banner_revision=0,
        client_request_id=uuid4(),
    )
    original = await service.save(_to_command(body), operator_id=operator, body=body)
    if kind == "nonce":
        result = await service.save(_to_command(body), operator_id=operator, body=body)
    else:
        result = await service.publish(
            original.message_id, operator_id=operator, body=BannerPublishRequest(banner_revision=1)
        )
    assert result.deduplicated and result.message_id == original.message_id
    row = one_event(json_log(), "notification.banner.deduplicated")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "INFO",
        "deduplicated",
        "duplicate_client_request" if kind == "nonce" else "already_published",
        str(original.message_id),
    )
    assert "private-" not in str(json_log())


async def test_banner_action_route_gone(db_session, monkeypatch, json_log):
    from plugin_notification.banner import services
    from plugin_notification.status_codes import NotificationStatusCode

    msg = await message(db_session, display_mode="top_banner", action={"type": "menu", "menu_id": str(uuid4())})
    monkeypatch.setattr(
        services, "resolve_action", AsyncMock(side_effect=AppException(NotificationStatusCode.INVALID_ACTION_ROUTE))
    )
    result = await services.BannerAnnouncementService(session=db_session)._summary(msg, session=db_session)
    assert result.action is None
    row = one_event(json_log(), "notification.banner.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "WARNING",
        "degraded",
        "action_route_unavailable",
        str(msg.id),
    )
    assert "private-" not in str(json_log())


async def test_banner_state_missing(db_session, json_log):
    from plugin_notification.banner.services import BannerAnnouncementService

    assert await BannerAnnouncementService().project_changes(db_session, required=False) == {}
    row = one_event(json_log(), "notification.banner.degraded")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("WARNING", "degraded", "banner_state_missing")
    assert "private-" not in str(json_log())


async def test_banner_slot_unchanged(db_session, json_log):
    from plugin_notification.banner.services import BannerAnnouncementService

    db_session.add(NotificationBannerState(id=BANNER_STATE_ID))
    await db_session.flush()
    msg = await message(db_session, display_mode="top_banner", status="draft")
    await BannerAnnouncementService(session=db_session, broadcaster=AsyncMock()).remove(
        msg.id, operator_id=uuid4(), operation="delete"
    )
    row = one_event(json_log(), "notification.banner.noop")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "INFO",
        "noop",
        "banner_slot_unchanged",
        str(msg.id),
    )
    assert "private-" not in str(json_log())


async def test_recall_broadcaster_missing(json_log):
    from plugin_notification.admin.services import AdminNotificationService

    mid = uuid4()
    await AdminNotificationService()._broadcast_recall(mid)
    row = one_event(json_log(), "notification.recall.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["message_id"]) == (
        "WARNING",
        "degraded",
        "recall_broadcaster_unavailable",
        str(mid),
    )
    assert "private-" not in str(json_log())
