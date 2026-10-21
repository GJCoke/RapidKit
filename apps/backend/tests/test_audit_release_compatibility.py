from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_system.audit_writer import AuditWriterImpl
from plugin_system.models import AuditLog, AuditLogTarget
from plugin_system.schemas import AuditLogDetail
from rapidkit_common.audit import AuditRecord
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.middlewares import audit

pytestmark = pytest.mark.asyncio


async def test_disabling_v2_keeps_existing_v2_readable(monkeypatch):
    records = []

    async def put(record):
        records.append(record)

    monkeypatch.setattr(audit, "audit_queue", SimpleNamespace(put=put))
    monkeypatch.setattr(audit.settings, "AUDIT_V2_ENABLED", True)
    app = FastAPI()
    app.add_middleware(audit.AuditMiddleware)

    @app.post("/example")
    async def example():
        return {"accepted": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/example")
        monkeypatch.setattr(audit.settings, "AUDIT_V2_ENABLED", False)
        await client.post("/example")
    assert len(records) == 2
    assert isinstance(records[0], AuditRecord)
    assert isinstance(records[1], dict)
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    try:
        async with engine.begin() as connection:
            for table in (AuditLog.__table__, AuditLogTarget.__table__):
                await connection.run_sync(table.create)
        async with AsyncSession(engine, expire_on_commit=False) as session:
            await AuditWriterImpl().append_in_transaction(session, records[0])
            session.add(AuditLog.model_validate(records[1]))
            await session.commit()
            rows = (await session.exec(select(AuditLog).order_by(AuditLog.schema_version.desc()))).all()
            detail = AuditLogDetail.model_validate(rows[0])
            assert detail.schema_version == 2
            assert detail.result == "unknown"
            assert rows[1].schema_version == 1
            assert rows[1].action == records[1]["action"]
            assert rows[1].resource_name == records[1]["resource_name"]
    finally:
        await engine.dispose()
