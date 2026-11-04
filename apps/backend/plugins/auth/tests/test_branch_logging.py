from contextlib import asynccontextmanager
from datetime import UTC, timedelta
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from rapidkit_common.enums import Status
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from plugin_auth.status_codes import AuthStatusCode
from tests.testing.utils import one_event


@asynccontextmanager
async def session_scope(session):
    yield session


@pytest.mark.parametrize("found", [False, True])
async def test_ineligible_password_reset(found, json_log):
    from plugin_auth.password_reset.service import request_password_reset

    user = NS(id=uuid4(), status=Status.OFF, email="private-reset@example.test") if found else None
    await request_password_reset(
        "private-reset@example.test", store=AsyncMock(), user_crud=NS(get_user_by_email=AsyncMock(return_value=user))
    )
    row = one_event(json_log(), "auth.password_reset.skipped")
    assert (row["level"], row["outcome"], row["reason_code"]) == (
        "INFO",
        "skipped",
        "password_reset_account_ineligible",
    )
    if found:
        assert row["user_id"] == str(user.id)
    assert "private-reset" not in str(json_log())


@pytest.mark.parametrize("found,reason", [(False, "invite_user_missing"), (True, "invite_user_not_pending")])
async def test_invite_ineligible(found, reason, monkeypatch, json_log):
    from plugin_auth.invite import service
    from rapidkit_core import database

    uid = uuid4()
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: session_scope(None))
    monkeypatch.setattr(database.RedisManager, "client", lambda: None)
    monkeypatch.setattr(
        service,
        "UserCRUD",
        lambda _: NS(get=AsyncMock(return_value=NS(status=Status.ON, username="private-invite") if found else None)),
    )
    await service.issue_and_send_invite(uid)
    row = one_event(json_log(), "auth.invite.skipped")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == ("INFO", "skipped", reason, str(uid))
    assert "private-invite" not in str(json_log())


def test_smtp_unconfigured(json_log):
    from plugin_auth.invite.email import EmailSender

    EmailSender(host="", port=25, user="", password="", sender="", use_tls=False).send(
        "private-email@example.test", "private-title", "private-content"
    )
    row = one_event(json_log(), "auth.email.degraded")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("WARNING", "degraded", "smtp_not_configured")
    assert "private-" not in str(json_log())


async def test_login_missing_user(monkeypatch, json_log):
    from plugin_auth.auth import services

    monkeypatch.setattr(services, "decrypt_password", lambda _: "private-password")
    monkeypatch.setattr(services, "check_password", lambda *_: False)
    monkeypatch.setattr(services, "_increment_login_attempts", AsyncMock())
    with pytest.raises(AppException):
        await services.user_login(
            "private-username",
            "private-cipher",
            user_crud=NS(get_user_by_username=AsyncMock(side_effect=AppException(AuthStatusCode.USER_NOT_FOUND))),
            token_store=AsyncMock(),
            redis=NS(get=AsyncMock(return_value=None)),
            user_agent="private-agent",
        )
    row = one_event(json_log(), "auth.login.rejected")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("WARNING", "rejected", "user_not_found")
    assert "private-" not in str(json_log())


async def test_impersonation_already_ended(json_log):
    from plugin_auth.impersonation.service import ImpersonationService
    from plugin_auth.impersonation.models import EndReason

    uid = uuid4()
    assert (
        await ImpersonationService(None, None, None, None)._end_in_transaction(
            None, NS(id=uid, ended_at=timezone.now()), EndReason.STOPPED
        )
        is False
    )
    row = one_event(json_log(), "auth.impersonation.noop")
    assert (row["level"], row["outcome"], row["reason_code"], row["impersonation_session_id"]) == (
        "INFO",
        "noop",
        "impersonation_already_ended",
        str(uid),
    )
    assert "private-" not in str(json_log())


async def test_impersonation_expired_stop(monkeypatch, json_log):
    from plugin_auth.impersonation.service import ImpersonationService
    from plugin_auth.impersonation.models import EndReason

    record = NS(id=uuid4(), ended_at=None, expires_at=timezone.now() - timedelta(seconds=1))
    session = NS(
        exec=AsyncMock(return_value=NS(first=lambda: record)), begin=lambda: session_scope(None), flush=AsyncMock()
    )
    service = ImpersonationService(lambda: session_scope(session), None, None, None)
    monkeypatch.setattr(service, "_audit", AsyncMock())
    monkeypatch.setattr(service, "_cleanup", AsyncMock())
    assert await service.end(record.id, EndReason.STOPPED) is record
    assert record.end_reason == EndReason.EXPIRED.value
    row = one_event(json_log(), "auth.impersonation.fallback")
    assert (row["level"], row["outcome"], row["reason_code"], row["impersonation_session_id"]) == (
        "INFO",
        "fallback",
        "impersonation_stop_after_expiry",
        str(record.id),
    )
    assert "private-" not in str(json_log())


async def test_missing_impersonation_closer(monkeypatch, json_log):
    from plugin_auth.impersonation import service

    actor = uuid4()
    monkeypatch.setattr(service, "clear_active", AsyncMock())
    monkeypatch.setattr(service, "get_service_optional", lambda _: None)
    await service.ImpersonationService(None, None, None, None)._cleanup(NS(id=uuid4(), actor_id=actor))
    row = one_event(json_log(), "auth.dependency.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "WARNING",
        "degraded",
        "socket_closer_unavailable",
        str(actor),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("reason", ["impersonation_revoker_unavailable", "socket_closer_unavailable"])
async def test_force_relogin_missing_dependency(reason, monkeypatch, json_log):
    from plugin_auth.auth import token_store
    from rapidkit_common.protocols.impersonation import ImpersonationRevoker

    missing = ImpersonationRevoker if reason.startswith("impersonation") else token_store.UserSocketCloser
    monkeypatch.setattr(token_store, "get_service_optional", lambda key: None if key is missing else AsyncMock())
    uid = uuid4()
    await token_store.TokenStore(AsyncMock()).force_relogin(uid)
    row = one_event(json_log(), "auth.dependency.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "WARNING",
        "degraded",
        reason,
        str(uid),
    )
    assert "private-" not in str(json_log())


async def test_marker_read_failure(monkeypatch, json_log):
    from plugin_auth.auth.resolver import AuthContextResolverImpl

    claims = NS(act=uuid4(), sub=uuid4(), sid=uuid4(), exp=int(timezone.now().replace(tzinfo=UTC).timestamp()) + 3600)
    resolver = AuthContextResolverImpl(
        lambda: session_scope(NS(get=AsyncMock(return_value=None))),
        NS(get=AsyncMock(side_effect=RuntimeError("private-redis-error"))),
        None,
    )
    monkeypatch.setattr(resolver, "_load_participants", AsyncMock(return_value=NS()))
    monkeypatch.setattr(resolver, "_publish_auth", lambda *_: None)
    with pytest.raises(AppException):
        await resolver._resolve_impersonation(claims, None)
    row = one_event(json_log(), "auth.impersonation.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"], row["exception_type"]) == (
        "WARNING",
        "degraded",
        "impersonation_marker_read_failed",
        str(claims.act),
        "RuntimeError",
    )
    assert "private-" not in str(json_log())


def test_refresh_user_agent_mismatch(monkeypatch, json_log):
    from plugin_auth.auth import deps

    claims = NS(sub=uuid4(), agent="private-original-agent")
    monkeypatch.setattr(deps, "decode_token", lambda *_: claims)
    assert deps.parse_refresh_jwt_user("private-token", "private-new-agent") is claims
    row = one_event(json_log(), "auth.refresh.user_agent_mismatch")
    assert (row["level"], row["reason_code"], row["user_id"]) == ("WARNING", "user_agent_mismatch", str(claims.sub))
    assert "private-" not in str(json_log())


async def test_refresh_revoke_batch_count(monkeypatch, json_log):
    from plugin_auth.auth.token_store import TokenStore

    async def scan(**_):
        for key in ["one", "two", "three"]:
            yield key

    redis = NS(
        get=AsyncMock(return_value="999"),
        scan_iter=scan,
        mget=AsyncMock(return_value=["private-invalid", None, "private-invalid"]),
        delete=AsyncMock(return_value=1),
    )
    store = TokenStore(redis)
    monkeypatch.setattr(store, "force_relogin", AsyncMock())
    uid = uuid4()
    await store.revoke_all(uid)
    row = one_event(json_log(), "auth.refresh_token.revoked")
    assert (row["level"], row["affected_count"], row["user_id"]) == ("INFO", 1, str(uid))
    assert "private-" not in str(json_log())
