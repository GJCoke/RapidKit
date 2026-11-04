from contextlib import asynccontextmanager
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from rapidkit_core.timezone import timezone
from plugin_system.activity.models import ActivityEvent
from plugin_system.audit.models import AuditLog, AuditLogTarget
from rapidkit_common.audit import AuditRecord
from rapidkit_common.events import UserLoginEvent
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession
from tests.testing.utils import one_event


@pytest_asyncio.fixture
async def branch_db():
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False}, poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda conn: SQLModel.metadata.create_all(
                conn, tables=[ActivityEvent.__table__, AuditLog.__table__, AuditLogTarget.__table__]
            )
        )
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await engine.dispose()


@asynccontextmanager
async def scope(session):
    yield session


def test_invalid_actor_id(json_log):
    from plugin_system.activity.projector import _uuid_or_none

    assert _uuid_or_none("private-invalid-actor") is None
    row = one_event(json_log(), "system.activity.fallback")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("WARNING", "fallback", "invalid_actor_id")
    assert "private-" not in str(json_log())


async def test_activity_publisher_missing(branch_db, monkeypatch, json_log):
    from plugin_system.activity import projector

    monkeypatch.setattr(projector, "AsyncSessionLocal", lambda: scope(branch_db))
    monkeypatch.setattr(projector, "_sio", None)
    await projector.handle_activity_event(
        UserLoginEvent(
            user_id=str(uuid4()), event_id=uuid4().hex, occurred_at=timezone.now(), actor_name="private-name"
        )
    )
    assert len((await branch_db.exec(select(projector.ActivityEvent))).all()) == 1
    row = one_event(json_log(), "system.activity.degraded")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("WARNING", "degraded", "publisher_unavailable")
    assert "private-" not in str(json_log())


async def test_audit_duplicate(branch_db, json_log):
    from plugin_system.audit.writer import AuditWriterImpl

    record = AuditRecord(action="user.update", actor_name="private-name", actor_username="private-user")
    writer = AuditWriterImpl()
    await writer.append_in_transaction(branch_db, record)
    await writer.append_in_transaction(branch_db, record)
    row = one_event(json_log(), "system.audit.deduplicated")
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_id"]) == (
        "INFO",
        "deduplicated",
        "duplicate_audit_record",
        str(record.id),
    )
    assert "private-" not in str(json_log())


async def test_dashboard_connect_forbidden(monkeypatch, json_log):
    from plugin_system.dashboard import events

    uid = uuid4()
    monkeypatch.setattr(events, "current_identity", lambda: NS(user_id=str(uid)))
    monkeypatch.setattr(
        events,
        "get_service",
        lambda _: NS(get_by_id=AsyncMock(return_value=NS(id=uid, is_admin=False, name="private-name"))),
    )
    assert await events.dashboard_connect("private-socket", None) is False
    row = one_event(json_log(), "system.dashboard.rejected")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "WARNING",
        "rejected",
        "dashboard_realtime_forbidden",
        str(uid),
    )
    assert "private-" not in str(json_log())


async def test_schedule_count_unavailable(json_log):
    from plugin_system.dashboard.services import build_business_summary

    session = NS(
        execute=AsyncMock(
            side_effect=[NS(scalar_one=lambda: 2), NS(scalar_one=lambda: 3), RuntimeError("private-database-error")]
        )
    )
    assert await build_business_summary(session, enable_celery=True, route_count=4) == {
        "roles": 2,
        "menus": 3,
        "routers": 4,
        "schedules": 0,
    }
    row = one_event(json_log(), "system.dashboard.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["exception_type"]) == (
        "WARNING",
        "degraded",
        "schedule_count_unavailable",
        "RuntimeError",
    )
    assert "private-" not in str(json_log())
