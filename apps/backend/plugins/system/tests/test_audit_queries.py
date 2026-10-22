from datetime import datetime
from uuid import uuid4

import pytest
from plugin_system.audit.crud import AuditLogCRUD
from plugin_system.audit.models import AuditLog, AuditLogTarget
from plugin_system.audit.schemas import AuditLogQuery
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def audit_crud():
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(AuditLog.__table__.create)
        await connection.run_sync(AuditLogTarget.__table__.create)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        rows = [
            AuditLog(
                action="user.update",
                actor_type="user",
                actor_name="Lin",
                actor_username="lin-account",
                resource_type="user",
                resource_name="Reader",
                result="failure",
                source="http",
            ),
            AuditLog(
                action="department.update",
                actor_type="user",
                actor_name="Other",
                resource_type="department",
                resource_name="Lin team",
                result="success",
                source="http",
            ),
            AuditLog(
                action="user.batch-delete", actor_type="user", resource_type="user", result="partial", source="http"
            ),
            AuditLog(
                action="impersonation.start",
                actor_type="user",
                resource_type="impersonation",
                result="success",
                impersonation_session_id=uuid4(),
                source="system",
            ),
            AuditLog(
                action="task.execute", actor_type="system", resource_type="task", result="unknown", source="system"
            ),
        ]
        session.add_all(rows)
        await session.flush()
        session.add(
            AuditLogTarget(
                audit_log_id=rows[2].id,
                resource_type="user",
                resource_id="batch-target",
                resource_name="Lin batch 100%",
                result="success",
            )
        )
        await session.commit()
        session.expire_all()
        yield AuditLogCRUD(session)
    await engine.dispose()


async def test_keyword_matches_actor_object_and_batch_before_paginating(audit_crud):
    page = await audit_crud.get_audit_page(AuditLogQuery(keyword="Lin", page_size=1))
    assert page.total == 3
    assert len(page.records) == 1
    page = await audit_crud.get_audit_page(AuditLogQuery(keyword="lin-account", result="failure"))
    assert [row.action for row in page.records] == ["user.update"]
    page = await audit_crud.get_audit_page(AuditLogQuery(keyword="100%", resource_type="user"))
    assert [row.action for row in page.records] == ["user.batch-delete"]
    page = await audit_crud.get_audit_page(AuditLogQuery(keyword="Lin", resource_type="department"))
    assert [row.action for row in page.records] == ["department.update"]


@pytest.mark.parametrize(
    "view,actions",
    [
        ("attention", {"user.update", "user.batch-delete", "task.execute"}),
        ("system", {"task.execute"}),
        ("impersonation", {"impersonation.start"}),
    ],
)
async def test_purpose_views_use_outcome_and_identity_not_transport_source(audit_crud, view, actions):
    page = await audit_crud.get_audit_page(AuditLogQuery(view=view))
    assert {row.action for row in page.records} == actions


async def test_query_rejects_unknown_purpose_and_unbounded_keyword():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        AuditLogQuery(view="unrecognized")
    with pytest.raises(ValidationError):
        AuditLogQuery(keyword="x" * 201)


async def test_audit_query_excludes_end_boundary():
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(AuditLog.__table__.create)
        await connection.run_sync(AuditLogTarget.__table__.create)
    async with AsyncSession(engine) as session:
        for hour in (10, 11, 12):
            session.add(
                AuditLog(
                    action="user.update", result="success", source="http", occurred_at=datetime(2026, 10, 21, hour)
                )
            )
        await session.commit()
        page = await AuditLogCRUD(session).get_audit_page(
            AuditLogQuery(start_time="2026-10-21T10:00:00Z", end_time="2026-10-21T12:00:00Z")
        )
        assert [item.occurred_at.hour for item in page.records] == [11, 10]
    await engine.dispose()
