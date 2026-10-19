# ruff: noqa: F811
from unittest.mock import AsyncMock

import pytest
from plugin_auth.auth.token_store import TokenStore
from plugin_auth.impersonation.cache import active_key, actor_key, subject_key
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_auth.providers import SessionInvalidatorImpl
from plugin_user.api import update_user
from plugin_user.crud import UserManageCRUD
from plugin_user.schemas import UserManageUpdate
from plugins.auth.tests.impersonation_helpers import strict_client, target  # noqa: F401
from plugins.auth.tests.test_impersonation_service import setup_service, start  # noqa: F401
from rapidkit_common.access import Scope
from rapidkit_common.protocols.impersonation import ImpersonationRevoker
from rapidkit_framework.services import get_service
from sqlmodel import select


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["token", "invalidator"])
@pytest.mark.parametrize("side", [0, 2])
async def test_revocation_without_user_index(setup_service, monkeypatch, entry, side):
    service, users, factory = setup_service
    record = await start(service, users)
    await service.redis.delete(actor_key(users[0].id), subject_key(users[2].id))
    module = "plugin_auth.auth.token_store" if entry == "token" else "plugin_auth.providers"
    monkeypatch.setattr(module + ".get_service_optional", lambda protocol: service)
    if entry == "token":
        await TokenStore(service.redis).revoke_all(users[side].id)
    else:
        await SessionInvalidatorImpl().invalidate_user_sessions(users[side].id, service.redis)
    async with factory() as session:
        stored = await session.get(ImpersonationSession, record.id)
        assert stored.end_reason == ("actor_revoked" if side == 0 else "subject_revoked")
    assert not await service.redis.exists(active_key(record.id))
    service.socket_closer.close_session.assert_awaited_once_with(record.id, service.redis)


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["status", "isAdmin", "delete", "batch"])
async def test_real_user_api_revokes_subject(strict_client, auth_headers, target, session, monkeypatch, change):
    revoker = get_service(ImpersonationRevoker)
    closer = AsyncMock()
    monkeypatch.setattr(revoker, "socket_closer", closer)
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)}
    )
    assert response.json()["code"] == 0, response.text
    stored = (await session.exec(select(ImpersonationSession))).one()
    if change in ("status", "isAdmin"):
        response = await strict_client.put(
            "/users/" + str(target.id), headers=auth_headers, json={change: "2" if change == "status" else True}
        )
    elif change == "delete":
        response = await strict_client.delete("/users/" + str(target.id), headers=auth_headers)
    else:
        response = await strict_client.request("DELETE", "/users", headers=auth_headers, json={"ids": [str(target.id)]})
    assert response.json()["code"] == 0, response.text
    await session.refresh(stored)
    assert stored.end_reason == "subject_revoked"
    closer.close_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_rollback_keeps_active(setup_service, monkeypatch):
    service, users, factory = setup_service
    record = await start(service, users)
    monkeypatch.setattr("plugin_user.services.get_service_optional", lambda protocol: service)
    async with factory() as session:
        await update_user(
            users[2].id, UserManageUpdate(status="2"),
            Scope(user=users[0], code="user:update"),
            UserManageCRUD(session), service.redis, session
        )
        async with factory() as reader:
            assert (await reader.get(ImpersonationSession, record.id)).ended_at is None
        await session.rollback()
    async with factory() as session:
        assert (await session.get(ImpersonationSession, record.id)).ended_at is None
    service.socket_closer.close_session.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["status", "isAdmin"])
async def test_real_user_api_revokes_actor(strict_client, auth_headers, target, session, change):
    response = await strict_client.post(
        "/auth/impersonations", headers=auth_headers, json={"targetUserId": str(target.id)}
    )
    assert response.json()["code"] == 0
    record = (await session.exec(select(ImpersonationSession))).one()
    response = await strict_client.put(
        "/users/" + str(record.actor_id), headers=auth_headers, json={change: "2" if change == "status" else False}
    )
    assert response.json()["code"] == 0, response.text
    await session.refresh(record)
    assert record.end_reason == "actor_revoked"
