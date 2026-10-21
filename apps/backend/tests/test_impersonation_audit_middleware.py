from importlib import import_module
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi import Request as FastAPIRequest
from httpx import ASGITransport, AsyncClient
from plugin_auth.status_codes import AuthStatusCode
from rapidkit_core.config import settings
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.identity import IdentityMetadata, bind_identity, current_identity, identity_scope
from src.middlewares.audit import AuditMiddleware, _is_excluded_path, record_audit_outcome
from src.middlewares.context import ContextMiddleware
from starlette.requests import Request
from starlette.responses import Response


def test_configured_exclusions():
    for path in ["/api/v1/auth/token/refresh", "/api/v1/auth/impersonations/current"]:
        assert _is_excluded_path(path)
        assert _is_excluded_path(path, settings.AUDIT_EXCLUDE_PATHS)


@pytest.mark.parametrize(
    "identified,method,audited",
    [(True, "PUT", False), (False, "PUT", False), (True, "GET", False), (True, "PUT", True)],
)
async def test_identity_is_read_after_downstream(monkeypatch, identified, method, audited):
    records = []

    async def put(record):
        records.append(record)

    monkeypatch.setattr("src.middlewares.audit.audit_queue", SimpleNamespace(put=put))
    actor, subject, session = uuid4(), uuid4(), uuid4()

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    request = Request(
        {
            "type": "http",
            "app": FastAPI(),
            "method": method,
            "path": "/api/v1/users/one",
            "query_string": b"",
            "headers": [(b"authorization", b"Bearer forged-act-token")],
        },
        receive,
    )

    async def downstream(request):
        if identified:
            request.state.auth = SimpleNamespace(
                actor_id=actor, subject_user_id=subject, impersonation_session_id=session
            )
        record_audit_outcome(request, business_code=14017)
        request.state.impersonation_lifecycle_audited = audited
        return Response(status_code=200)

    await AuditMiddleware(lambda *args: None).dispatch(request, downstream)
    if method == "GET" or audited:
        assert records == []
    else:
        assert records[0].actor_id == (actor if identified else None)
        assert records[0].subject_user_id == (subject if identified else None)
        assert records[0].impersonation_session_id == (session if identified else None)
        assert records[0].result == "failure"


@pytest.mark.parametrize("error_name", ["AUTHENTICATION_FAILED", "INSUFFICIENT_PERMISSIONS"])
async def test_real_exception_handler_preserves_failure_identity(monkeypatch, error_name):

    records = []

    async def put(record):
        records.append(record)

    async def increment():
        pass

    monkeypatch.setattr("src.middlewares.audit.audit_queue", SimpleNamespace(put=put))
    monkeypatch.setattr("src.main._increment_biz_error", increment)
    app = FastAPI()
    import_module("src.main").setup_exception_handlers(app)
    app.add_middleware(AuditMiddleware)
    actor, subject, session = uuid4(), uuid4(), uuid4()

    @app.put("/api/v1/audit-failure")
    async def fail(request: FastAPIRequest):
        request.state.auth = SimpleNamespace(
            actor=SimpleNamespace(id=actor, name="Admin"),
            subject=SimpleNamespace(id=subject, name="Target", username="target"),
            impersonation_session_id=session,
        )
        raise AppException(getattr(AuthStatusCode, error_name))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.put("/api/v1/audit-failure")
    assert response.status_code == 200
    assert response.json()["code"] == int(getattr(AuthStatusCode, error_name))
    assert records[0].result == "failure"
    assert records[0].actor_id == actor
    assert records[0].subject_user_id == subject
    assert records[0].impersonation_session_id == session
    assert records[0].metadata.subject_name == "Target"
    assert records[0].metadata.subject_username == "target"


@pytest.mark.parametrize("method,path", [("GET", "/api/v1/users"), ("POST", "/api/v1/auth/token/refresh")])
async def test_context_identity_scope_always_restores(method, path):

    request = Request({"type": "http", "method": method, "path": path, "headers": []})
    outer = IdentityMetadata(actor_id="outer")

    async def downstream(request):
        assert current_identity() == IdentityMetadata()
        bind_identity(IdentityMetadata(actor_id="request"))
        raise ValueError("downstream")

    with identity_scope(outer):
        with pytest.raises(ValueError, match="downstream"):
            await ContextMiddleware(lambda *args: None).dispatch(request, downstream)
        assert current_identity() == outer
