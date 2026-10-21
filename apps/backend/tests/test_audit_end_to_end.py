from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from plugin_department.models import Department
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import Response
from rapidkit_core import database
from rapidkit_core.nanoid import NanoIdPlugin
from rapidkit_framework.audit import AuditActionDef
from rapidkit_framework.plugin import PluginManifest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.middlewares import audit
from src.middlewares.context import ContextMiddleware

pytestmark = pytest.mark.asyncio


async def test_verified_actor_actual_object_and_generated_request_id_survive_commit(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(Department.__table__.create)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database, "get_async_session_factory", lambda: factory)
    monkeypatch.setattr(audit.settings, "AUDIT_V2_ENABLED", True)
    records = []

    async def put(record):
        records.append(record)

    monkeypatch.setattr(audit, "audit_queue", SimpleNamespace(put=put))
    app = FastAPI()
    definition = AuditActionDef(
        "department.create",
        "audit.actions.department.create",
        "department",
        "audit.resources.department",
        model=Department,
        fields={"name": "audit.fields.name"},
    )
    app.state.plugins = [PluginManifest("example", "1", audit_actions=[definition])]
    app.add_middleware(audit.AuditMiddleware)
    app.add_middleware(ContextMiddleware, plugins=(NanoIdPlugin(),))
    actor_id = uuid4()

    @app.post("/department", openapi_extra={"x-audit": {"action": "department.create"}})
    async def create_department(request: Request, session: SessionDep) -> Response[str]:
        request.state.auth = SimpleNamespace(actor=SimpleNamespace(id=actor_id, name="Admin", username="admin"))
        row = Department(name="Target department", code="target")
        session.add(row)
        await session.flush()
        return Response(data=str(row.id))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/department")
    assert response.status_code == 200
    assert len(records) == 1
    record = records[0]
    assert (record.actor_name, record.resource_name) == ("Admin", "Target department")
    assert record.actor_id == actor_id
    assert record.actor_username == "admin"
    assert record.request_id == response.headers["x-request-id"]
    assert record.result == "success"
    async with factory() as session:
        assert len((await session.exec(select(Department))).all()) == 1
    await engine.dispose()
