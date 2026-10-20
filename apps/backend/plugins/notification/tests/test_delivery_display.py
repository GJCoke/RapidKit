"""Delivery display projects current-page identities and title-only metadata."""

from types import SimpleNamespace
from uuid import UUID, uuid4

import plugin_notification.admin.api as api
import pytest
from plugin_notification.admin.schemas import DeliveryListQuery
from plugin_notification.crud import OutboxCRUD
from plugin_notification.models import NotificationMessage, NotificationOutbox
from rapidkit_common.protocols.user import UserDisplayProfile


@pytest.mark.asyncio
async def test_delivery_page_batches_recipients_and_retains_disabled_deleted_and_message_info(db_session, monkeypatch):
    active, disabled, deleted = (uuid4() for _ in range(3))
    message = NotificationMessage(
        source="admin",
        category="admin.announcement",
        content_mode="raw",
        title="系统维护通知",
        content="正文不属于投递摘要",
        correlation_id="display",
        status="published",
    )
    db_session.add(message)
    await db_session.flush()
    for index, uid in enumerate((active, disabled, deleted, active), 1):
        db_session.add(
            NotificationOutbox(
                id=UUID(int=index),
                message_id=message.id,
                user_id=uid,
                channel="in_app",
                status="sent",
                idempotency_key=f"display-{index}",
            )
        )
    await db_session.flush()
    calls = []

    class Users:
        async def get_display_profiles(self, ids):
            calls.append(ids)
            profiles = {
                active: UserDisplayProfile(id=active, name="张三", username="zhangsan", department="研发部"),
                disabled: UserDisplayProfile(id=disabled, name="李四", username="lisi", status="2"),
            }
            return {uid: profiles[uid] for uid in ids if uid in profiles}

    monkeypatch.setattr(api, "get_service", lambda protocol: Users())
    crud = OutboxCRUD(db_session)
    result = await api.list_deliveries(query=DeliveryListQuery(message_id=message.id), current_user=None, crud=crud)
    assert result.data.total == 4
    records = {row.user_id: row for row in result.data.records}
    assert records[active].recipient.name == "张三"
    assert records[active].recipient.username == "zhangsan"
    assert records[active].recipient.department == "研发部"
    assert records[disabled].recipient.state == "disabled"
    assert records[deleted].recipient.state == "deleted"
    assert records[deleted].recipient.username == ""
    assert set(calls[0]) == {active, disabled, deleted}
    assert len(calls[0]) == 3
    assert records[active].message.title == "系统维护通知"
    assert records[active].message.category == "admin.announcement"
    assert "正文不属于投递摘要" not in result.model_dump_json()
    calls.clear()
    page = await api.list_deliveries(
        query=DeliveryListQuery(message_id=message.id, page=1, page_size=1), current_user=None, crud=crud
    )
    assert page.data.total == 4
    assert len(page.data.records) == 1
    assert calls == [[active]]
    calls.clear()
    empty = await api.list_deliveries(
        query=DeliveryListQuery(message_id=message.id, status="dead"), current_user=None, crud=crud
    )
    assert empty.data.records == []
    assert calls == []


@pytest.mark.asyncio
async def test_summary_resolves_localized_titles_even_when_no_delivery_rows_exist(db_session):
    message = NotificationMessage(
        source="admin",
        category="admin.announcement",
        content_mode="local",
        title="维护通知",
        content="secret body",
        correlation_id="local-display",
        status="draft",
        content_params={
            "defaultLocale": "zh-CN",
            "translations": {
                "zh-CN": {"title": "{team}维护", "content": "秘密正文{team}"},
                "en-US": {"title": "{team} maintenance", "content": "secret body {team}"},
            },
            "parameters": {"team": "RapidKit"},
        },
    )
    db_session.add(message)
    await db_session.flush()
    result = await api.delivery_summary(message_id=message.id, current_user=None, crud=OutboxCRUD(db_session))
    assert result.data.by_status == {}
    assert result.data.message.title == "维护通知"
    assert result.data.message.titles == {"zh-CN": "RapidKit维护", "en-US": "RapidKit maintenance"}
    assert result.data.message.default_locale == "zh-CN"
    assert result.data.message.status == "draft"
    assert "secret body" not in result.model_dump_json()
    assert "秘密正文" not in result.model_dump_json()
    missing = await api.delivery_summary(
        message_id=uuid4(), current_user=SimpleNamespace(), crud=OutboxCRUD(db_session)
    )
    assert missing.data.message is None
