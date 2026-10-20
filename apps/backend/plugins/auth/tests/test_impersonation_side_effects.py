# ruff: noqa: F811
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from plugin_auth.impersonation.cache import active_key
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_system.models import AuditLog
from plugin_user.models import UserDailyActivity
from plugins.auth.tests.impersonation_helpers import (  # noqa: F401
    drain_identity_events,
    login_headers,
    strict_client,
    target,
)
from rapidkit_common.events import UserActivityObservedEvent, UserLoginEvent, UserLogoutEvent
from rapidkit_common.protocols import AuthContextResolver, ImpersonationAuditWriter
from rapidkit_core.timezone import timezone
from rapidkit_framework.events import event_bus
from rapidkit_framework.services import get_service
from sqlmodel import func, select
from src.sio.constants import presence_structure


async def create_session(client, headers, target_id):
    response = (
        await client.post(
            "/auth/impersonations", headers=headers, json={"targetUserId": str(target_id), "reason": "scope check"}
        )
    ).json()
    assert response["code"] == 0, response
    data = response["data"]
    return data, {"Authorization": "Bearer " + data["accessToken"]}


@pytest.mark.asyncio
async def test_simulation_does_not_change_real_login_activity_or_online_state(
    strict_client, auth_headers, target, session, redis, monkeypatch
):
    target.last_login_time = timezone.now() - timedelta(days=2)
    session.add(target)
    await session.commit()
    real = await login_headers(strict_client, target.username, "Test123456!")
    for headers in (auth_headers, real):
        assert (await strict_client.get("/auth/user/info", headers=headers)).json()["code"] == 0
    await drain_identity_events()
    await session.refresh(target)
    before_login = target.last_login_time
    assert before_login is not None
    assert (
        await session.exec(
            select(func.count()).select_from(UserDailyActivity).where(UserDailyActivity.user_id == target.id)
        )
    ).one() == 1
    observed = []
    original_emit = event_bus.fire_and_forget

    def observe(event, **kwargs):
        if isinstance(event, (UserActivityObservedEvent, UserLoginEvent, UserLogoutEvent)):
            observed.append(event)
        return original_emit(event, **kwargs)

    monkeypatch.setattr(event_bus, "fire_and_forget", observe)
    before_activity = (await session.exec(select(func.count()).select_from(UserDailyActivity))).one()
    await redis.sadd("online_users", str(target.id))
    sid_key = presence_structure.format(user_id=target.id)
    await redis.zadd(sid_key, {"real-session": 123})
    before_online = await redis.smembers("online_users")
    created, simulated = await create_session(strict_client, auth_headers, target.id)
    assert (await strict_client.get("/auth/user/info", headers=simulated)).json()["code"] == 0
    assert (await strict_client.delete("/auth/impersonations/current", headers=simulated)).json()["code"] == 0
    await drain_identity_events()
    await session.refresh(target)
    assert target.last_login_time == before_login
    assert (await session.exec(select(func.count()).select_from(UserDailyActivity))).one() == before_activity
    assert await redis.smembers("online_users") == before_online
    assert await redis.zscore(sid_key, "real-session") == 123
    stored = await session.get(ImpersonationSession, UUID(created["sessionId"]))
    # The authenticated administrator may record their own activity; the simulated target must not.
    assert all(
        isinstance(event, UserActivityObservedEvent) and event.user_id == str(stored.actor_id) for event in observed
    )
    records = (await session.exec(select(AuditLog).where(AuditLog.impersonation_session_id == stored.id))).all()
    assert {record.action for record in records} == {"impersonation.start", "impersonation.stop"}
    assert all(record.actor_id == stored.actor_id and record.subject_user_id == target.id for record in records)
    assert all(record.extra_data["subject_name"] == target.name for record in records)
    assert all(record.actor_name and record.extra_data["subject_username"] == target.username for record in records)
    assert all(record.extra_data["reason"] == "scope check" for record in records)


@pytest.mark.asyncio
@pytest.mark.parametrize("stale", [False, True])
async def test_marker_recovery_and_stopped_database_authority(strict_client, auth_headers, target, redis, stale):
    created, headers = await create_session(strict_client, auth_headers, target.id)
    key = active_key(created["sessionId"])
    marker = await redis.get(key)
    await redis.delete(key)
    assert (await strict_client.get("/auth/user/info", headers=headers)).json()["code"] == 0
    assert await redis.get(key)
    assert (await strict_client.delete("/auth/impersonations/current", headers=headers)).json()["code"] == 0
    if stale:
        await redis.set(key, marker)
    else:
        await redis.delete(key)
    assert (await strict_client.get("/auth/user/info", headers=headers)).json()["code"] == 14017


@pytest.mark.asyncio
@pytest.mark.parametrize("storage", ["database", "redis"])
async def test_storage_outage_fails_closed(strict_client, auth_headers, target, monkeypatch, storage):
    _, headers = await create_session(strict_client, auth_headers, target.id)
    resolver = get_service(AuthContextResolver)
    if storage == "database":

        def unavailable():
            raise ConnectionError("database unavailable")

        monkeypatch.setattr(resolver, "session_factory", unavailable)
    else:
        monkeypatch.setattr(
            resolver,
            "_redis",
            SimpleNamespace(
                get=AsyncMock(side_effect=ConnectionError("redis unavailable")),
                exists=AsyncMock(side_effect=ConnectionError("redis unavailable")),
            ),
        )
    assert (await strict_client.get("/auth/user/info", headers=headers)).json()["code"] == 14017


@pytest.mark.asyncio
async def test_failed_replacement_keeps_previous_session_and_audit(
    strict_client, auth_headers, target, session, monkeypatch
):
    created, headers = await create_session(strict_client, auth_headers, target.id)
    writer = get_service(ImpersonationAuditWriter)
    original = writer.append

    async def unavailable(db, record):
        await original(db, record)
        if record["action"] == "impersonation.start":
            raise RuntimeError("audit unavailable")

    monkeypatch.setattr(writer, "append", unavailable)
    response = (
        await strict_client.post("/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)})
    ).json()
    assert response["code"] == 17001 and response["data"] is None
    records = (await session.exec(select(ImpersonationSession))).all()
    assert len(records) == 1 and str(records[0].id) == created["sessionId"] and records[0].ended_at is None
    audits = (await session.exec(select(AuditLog).where(AuditLog.impersonation_session_id == records[0].id))).all()
    assert [item.action for item in audits] == ["impersonation.start"]
    assert (await strict_client.get("/auth/impersonations/current", headers=headers)).json()["code"] == 0
