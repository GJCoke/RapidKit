from datetime import datetime

import pytest
from plugin_system.audit_crud import AuditLogCRUD
from plugin_system.models import AuditLog, AuditLogTarget
from plugin_system.schemas import AuditLogQuery
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

pytestmark = pytest.mark.asyncio


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
