# ruff: noqa: F811
from datetime import UTC, timedelta

import pytest
from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_system.models import AuditLog
from plugin_user.models import User
from plugins.auth.tests.impersonation_helpers import login_headers, strict_client, target  # noqa: F401, F811
from rapidkit_common.enums import Status
from rapidkit_common.protocols import ImpersonationAuditWriter
from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7
from rapidkit_framework.services import get_service
from rapidkit_security import create_impersonation_token, decode_impersonation_token
from sqlmodel import select


@pytest.mark.asyncio
async def test_start_current_and_repeated_stop(strict_client, auth_headers, target):
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id), "reason": "菜单排查"}
    )
    assert response.json()["code"] == 0, response.text
    created = response.json()["data"]
    assert "refreshToken" not in created
    simulated = {"Authorization": "Bearer " + created["accessToken"]}
    current = await strict_client.get("/auth/impersonations/current", headers=simulated)
    assert current.json()["data"]["subject"]["id"] == str(target.id), current.text
    for _ in range(2):
        stopped = await strict_client.delete("/auth/impersonations/current", headers=simulated)
        assert stopped.json()["data"] is True, stopped.text
    rejected = await strict_client.get("/auth/user/info", headers=simulated)
    assert rejected.json()["code"] == 14017


@pytest.mark.asyncio
async def test_ordinary_credentials_cannot_read_or_stop(strict_client, auth_headers):
    for method in (strict_client.get, strict_client.delete):
        response = await method("/auth/impersonations/current", headers=auth_headers)
        assert response.json()["code"] == 14017


@pytest.mark.asyncio
async def test_non_admin_cannot_start(strict_client, target):
    headers = await login_headers(strict_client, target.username, "Test123456!")
    response = await strict_client.post("/auth/impersonations", headers=headers, json={"targetUserId": str(target.id)})
    assert response.json()["code"] == 14015


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["self", "admin", "off", "pending", "missing"])
async def test_invalid_targets(strict_client, auth_headers, target, session, kind):
    admin = (await session.exec(select(User).where(User.is_admin.is_(True)))).first()
    target_id = target.id
    if kind in ("self", "admin"):
        target_id = admin.id
    elif kind == "missing":
        target_id = uuid7()
    else:
        target.status = Status.OFF if kind == "off" else Status.PENDING
        session.add(target)
        await session.commit()
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target_id)}
    )
    assert response.json()["code"] == 14016
    assert not (await session.exec(select(ImpersonationSession))).all()


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["sid", "act", "sub", "exp"])
async def test_stop_rejects_wrong_binding(strict_client, auth_headers, target, field):
    created = (
        await strict_client.post("/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)})
    ).json()["data"]
    original = decode_impersonation_token(
        created["accessToken"], auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG
    )
    claims = original.model_copy(update={field: original.exp + 1 if field == "exp" else uuid7()})
    token = create_impersonation_token(claims, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG)
    response = await strict_client.delete("/auth/impersonations/current", headers={"Authorization": "Bearer " + token})
    assert response.json()["code"] == 14017
    current = await strict_client.get(
        "/auth/impersonations/current", headers={"Authorization": "Bearer " + created["accessToken"]}
    )
    assert current.json()["code"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["expired", "actor_revoked", "subject_revoked"])
async def test_stop_accepts_expired_or_revoked_users(strict_client, auth_headers, target, session, kind):
    created = (
        await strict_client.post("/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)})
    ).json()["data"]
    claims = decode_impersonation_token(
        created["accessToken"], auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG
    )
    if kind == "expired":
        record = await session.get(ImpersonationSession, claims.sid)
        record.expires_at = timezone.now().replace(microsecond=0) - timedelta(seconds=1)
        claims = claims.model_copy(update={"exp": int(record.expires_at.replace(tzinfo=UTC).timestamp())})
        session.add(record)
    else:
        user = await session.get(User, claims.act if kind == "actor_revoked" else claims.sub)
        user.status = Status.OFF
        session.add(user)
    await session.commit()
    token = create_impersonation_token(claims, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG)
    response = await strict_client.delete("/auth/impersonations/current", headers={"Authorization": "Bearer " + token})
    assert response.json()["code"] == 0
    if kind == "expired":
        for _ in range(2):
            repeated = await strict_client.delete(
                "/auth/impersonations/current", headers={"Authorization": "Bearer " + token}
            )
            assert repeated.json()["code"] == 0
        await session.refresh(record)
        assert record.end_reason == "expired"
        audits = (
            await session.exec(
                select(AuditLog).where(
                    AuditLog.impersonation_session_id == claims.sid,
                    AuditLog.action == "impersonation.expire",
                )
            )
        ).all()
        assert len(audits) == 1


@pytest.mark.asyncio
async def test_start_audit_failure_rolls_back_http(strict_client, auth_headers, target, session, monkeypatch):
    writer = get_service(ImpersonationAuditWriter)
    original = writer.append

    async def fail_after_append(db, record):
        await original(db, record)
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(writer, "append", fail_after_append)
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)}
    )
    assert response.json()["code"] == 17001
    assert not (await session.exec(select(ImpersonationSession))).all()
    assert not (await session.exec(select(AuditLog).where(AuditLog.action == "impersonation.start"))).all()
