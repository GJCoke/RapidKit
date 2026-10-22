# ruff: noqa: F811
"""Deny guard executes before credential-specific header/body parsing."""

import pytest
from plugin_auth.auth_config import auth_settings
from plugin_system.audit.models import AuditLog
from plugins.auth.tests.impersonation_helpers import strict_client, target  # noqa: F401, F811
from rapidkit_common.protocols import ImpersonationAuditWriter
from rapidkit_framework.services import get_service
from rapidkit_security import decode_impersonation_token
from sqlmodel import select


@pytest.mark.asyncio
@pytest.mark.parametrize("header", ["Authorization", "X-Refresh-Token"])
async def test_blacklisted_routes(strict_client, auth_headers, target, header):
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)}
    )
    assert response.json()["code"] == 0
    token = response.json()["data"]["accessToken"]
    headers = {header: "Bearer " + token if header == "Authorization" else token}
    for method, path in [
        ("POST", "/auth/logout"),
        ("POST", "/auth/token/refresh"),
        ("POST", "/auth/password-reset/request"),
        ("GET", "/auth/password-reset/validate"),
        ("POST", "/auth/password-reset/confirm"),
        ("POST", "/auth/impersonations"),
        ("PUT", f"/users/{target.id}/password"),
    ]:
        denied = await strict_client.request(method, path, headers=headers)
        assert denied.json()["code"] == 14018, (path, denied.text)
    current = await strict_client.get("/auth/impersonations/current", headers={"Authorization": "Bearer " + token})
    assert current.json()["code"] == 0


@pytest.mark.asyncio
async def test_anonymous_password_reset_contract(strict_client):
    response = await strict_client.get("/auth/password-reset/validate", params={"token": "missing"})
    assert response.json()["data"] == {"valid": False}
    response = await strict_client.post("/auth/password-reset/request", json={"email": "absent@example.com"})
    assert response.json()["code"] == 0
    response = await strict_client.post(
        "/auth/password-reset/confirm", json={"token": "missing", "newPassword": "invalid"}
    )
    assert response.json()["code"] not in (14003, 14017, 14018)


@pytest.mark.asyncio
async def test_denied_audit_failure_still_blocks_business(strict_client, auth_headers, target, session, monkeypatch):
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)}
    )
    started = response.json()["data"]
    token = started["accessToken"]
    queued = []

    async def capture(record):
        queued.append(record)

    monkeypatch.setattr("src.middlewares.audit.audit_queue.put", capture)
    writer = get_service(ImpersonationAuditWriter)
    original = writer.append

    async def fail_after_append(db, record):
        await original(db, record)
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(writer, "append", fail_after_append)
    response = await strict_client.post("/auth/logout", headers={"Authorization": "Bearer " + token})
    assert response.json()["code"] == 17001
    records = (await session.exec(select(AuditLog).where(AuditLog.action == "impersonation.denied"))).all()
    assert not records
    assert len(queued) == 1
    audit = queued[0].persistence_data()
    claims = decode_impersonation_token(token, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG)
    assert audit["actor_id"] == claims.act
    assert str(audit["subject_user_id"]) == str(target.id)
    assert str(audit["impersonation_session_id"]) == started["sessionId"]
    assert audit["extra_data"]["subject_name"] == target.name
    assert audit["result"] == "failure"
    current = await strict_client.get("/auth/impersonations/current", headers={"Authorization": "Bearer " + token})
    assert current.json()["code"] == 0
