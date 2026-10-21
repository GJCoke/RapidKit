"""Unit tests for audit collection boundaries and sanitization."""

from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI
from rapidkit_common.audit import AuditRecord
from src.middlewares.audit import (
    AuditMiddleware,
    _is_excluded_path,
    _read_auth_identity,
    _sanitize_mapping,
)
from starlette.requests import Request
from starlette.responses import Response


class AuditQueueStub:
    def __init__(self):
        self.records: list[AuditRecord] = []

    async def put(self, record: AuditRecord) -> None:
        self.records.append(record)


def test_refresh_token_endpoint_is_excluded_from_audit():
    assert _is_excluded_path("/api/v1/auth/token/refresh") is True


def test_sensitive_values_are_removed_recursively():
    sanitized = _sanitize_mapping(
        {
            "username": "coke",
            "password": "plain-secret",
            "profile": {
                "displayName": "Coke",
                "refreshToken": "jwt-value",
                "verificationCode": "123456",
            },
            "items": [{"name": "safe", "apiKey": "key-value"}],
        }
    )
    assert sanitized == {
        "username": "coke",
        "profile": {"displayName": "Coke"},
        "items": [{"name": "safe"}],
    }


def test_authenticated_request_reads_verified_actor():
    actor_id = uuid4()
    request = Request({"type": "http"})
    request.state.auth = SimpleNamespace(actor=SimpleNamespace(id=actor_id, username="admin"))
    identity = _read_auth_identity(request)
    assert identity["actor_id"] == actor_id
    assert identity["actor_name"] == "admin"
    assert identity["subject_user_id"] is None


async def test_audit_middleware_extracts_client_info_from_request(monkeypatch):
    queue = AuditQueueStub()
    monkeypatch.setattr("src.middlewares.audit.audit_queue", queue)
    monkeypatch.setattr(
        "src.middlewares.audit.settings",
        SimpleNamespace(
            AUDIT_ENABLED=True,
            AUDIT_EXCLUDE_PATHS=[],
            AUDIT_MAX_BODY_SIZE=16_384,
            AUDIT_SENSITIVE_FIELDS=[],
        ),
    )

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    request = Request(
        {
            "type": "http",
            "app": FastAPI(),
            "method": "POST",
            "path": "/api/v1/users",
            "query_string": b"",
            "headers": [
                (b"x-forwarded-for", b"203.0.113.9"),
                (b"user-agent", b"audit-regression-test"),
            ],
        },
        receive,
    )
    middleware = AuditMiddleware(lambda scope, receive, send: None)

    async def call_next(_: Request) -> Response:
        return Response(status_code=200)

    await middleware.dispatch(request, call_next)

    assert queue.records[0].ip == "203.0.113.9"
    assert queue.records[0].user_agent == "audit-regression-test"
    assert queue.records[0].response_code == 200
