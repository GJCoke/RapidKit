from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from src.middlewares import audit
from src.middlewares.audit import AuditMiddleware

pytestmark = pytest.mark.asyncio


async def test_v2_failure_records_business_code_and_safe_reason(monkeypatch):
    records = []
    monkeypatch.setattr(audit, "audit_queue", SimpleNamespace(put=AsyncMock(side_effect=records.append)))
    monkeypatch.setattr(
        audit,
        "settings",
        SimpleNamespace(
            AUDIT_ENABLED=True,
            AUDIT_V2_ENABLED=True,
            AUDIT_EXCLUDE_PATHS=[],
            AUDIT_SENSITIVE_FIELDS=[],
            AUDIT_MAX_BODY_SIZE=10240,
        ),
    )
    from src.main import setup_exception_handlers

    app = FastAPI()
    setup_exception_handlers(app)
    app.add_middleware(AuditMiddleware)

    @app.post("/fail")
    async def fail():
        raise AppException(StatusCode.RESOURCE_NOT_FOUND)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/fail")
    assert response.status_code == 200
    assert len(records) == 1
    assert records[0].result == "failure"
    assert records[0].business_code != 0
    assert records[0].action == "http.request"
    assert records[0].correlation_id is None
    assert records[0].resource_name is None


async def test_v2_validation_failure_is_not_success(monkeypatch):
    records = []
    monkeypatch.setattr(audit, "audit_queue", SimpleNamespace(put=AsyncMock(side_effect=records.append)))
    monkeypatch.setattr(audit.settings, "AUDIT_V2_ENABLED", True)
    from src.main import setup_exception_handlers

    app = FastAPI()
    setup_exception_handlers(app)
    app.add_middleware(AuditMiddleware)

    @app.post("/validate")
    async def validate(value: int):
        return value

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/validate", params={"value": "not-int"})
    assert records[0].result == "failure"


async def test_exception_after_committed_business_does_not_publish_false_failure(monkeypatch):
    from rapidkit_common.audit import current_audit

    records = []
    monkeypatch.setattr(audit, "audit_queue", SimpleNamespace(put=AsyncMock(side_effect=records.append)))
    monkeypatch.setattr(audit.settings, "AUDIT_V2_ENABLED", True)
    app = FastAPI()
    app.add_middleware(AuditMiddleware)

    @app.post("/committed")
    async def committed():
        context = current_audit.get()
        assert context is not None
        context.committed = True
        raise RuntimeError("response construction failed after commit")

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.post("/committed")
    assert response.status_code == 500
    assert records == []
