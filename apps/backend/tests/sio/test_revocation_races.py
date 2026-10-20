"""Admission must not outlive revocation between authentication and indexing."""

from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from engineio.async_socket import AsyncSocket
from fastapi_sio_di import SID
from plugin_auth.auth.resolver import AuthContextResolverImpl, user_structure
from plugin_auth.auth_config import auth_settings
from plugin_auth.providers import CurrentUserProviderImpl, SessionInvalidatorImpl
from plugin_user.models import User
from rapidkit_common.enums import Status
from rapidkit_common.protocols.auth import UserSocketCloser
from rapidkit_framework.identity import current_identity
from rapidkit_security import AccessJWT, create_token
from socketio.exceptions import ConnectionRefusedError
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from src.sio import identity, sessions


@pytest_asyncio.fixture
async def admission(session, pg_engine, redis, monkeypatch):
    user = User(name="User", username="socket-user", email="socket@example.com", password=b"test")
    session.add(user)
    await session.commit()
    factory = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    provider = CurrentUserProviderImpl(AuthContextResolverImpl(factory, redis, AsyncMock()))
    monkeypatch.setattr(identity, "get_service", lambda _: provider)
    monkeypatch.setattr(identity.RedisManager, "client", lambda: redis)
    server = identity.IdentityAwareAsyncServer(async_mode="asgi")
    server.eio.sockets["transport"] = AsyncSocket(server.eio, "transport")
    sid = await server.manager.connect("transport", "/notifications")
    admitted = []

    @server.on("connect", namespace="/notifications")
    async def connect(sid: SID):
        admitted.append(current_identity().user_id)

    closer = sessions.RedisSocketCloser(server)
    monkeypatch.setattr(
        "plugin_auth.providers.get_service_optional",
        lambda protocol: closer if protocol is UserSocketCloser else None,
    )
    token = create_token(
        AccessJWT(sub=user.id, name=user.username, jti=uuid4()),
        timedelta(minutes=5),
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )
    try:
        yield server, sid, user, factory, {"access_token": token}, admitted
    finally:
        await sessions.shutdown_socket_timers()


@pytest.mark.parametrize("change", ["force_relogin", "disable", "delete"])
async def test_revoked_identity_cannot_register_after_initial_auth(admission, redis, monkeypatch, change):
    server, sid, user, factory, auth, admitted = admission
    original = identity.register_socket
    cached_enabled_user = user.model_dump_json()

    async def revoke_before_index(*args):
        if change == "force_relogin":
            await SessionInvalidatorImpl().invalidate_user_sessions(user.id, redis)
        else:
            async with factory() as session:
                stored = await session.get(User, user.id)
                if change == "disable":
                    stored.status = Status.OFF
                else:
                    await session.delete(stored)
                await session.commit()
            # An earlier request can repopulate stale enabled data after cache invalidation.
            await redis.set(user_structure.format(user_id=user.id), cached_enabled_user)
            await sessions.RedisSocketCloser(server).close_user(user.id, redis)
        await original(*args)

    monkeypatch.setattr(identity, "register_socket", revoke_before_index)
    with pytest.raises(ConnectionRefusedError) as error:
        await server._trigger_event("connect", "/notifications", sid, {}, auth)
    assert error.value.error_args["message"] == "unauthorized"
    assert admitted == []
    assert not await redis.exists(f"sio:user:<{user.id}>:sockets")
    assert ("/notifications", sid) not in sessions._timers
    assert "trusted_identity" not in await server.get_session(sid, namespace="/notifications")


async def test_revocation_after_index_prevents_business_admission(admission, redis, monkeypatch):
    server, sid, user, _, auth, admitted = admission
    original = identity.register_socket

    async def revoke_after_index(*args):
        await original(*args)
        await SessionInvalidatorImpl().invalidate_user_sessions(user.id, redis)

    monkeypatch.setattr(identity, "register_socket", revoke_after_index)
    with pytest.raises(ConnectionRefusedError):
        await server._trigger_event("connect", "/notifications", sid, {}, auth)
    assert admitted == []
    assert not server.manager.is_connected(sid, "/notifications")
    assert not await redis.exists(f"sio:user:<{user.id}>:sockets")
    assert ("/notifications", sid) not in sessions._timers


async def test_valid_identity_is_admitted_after_registration(admission, redis):
    server, sid, user, _, auth, admitted = admission
    await server._trigger_event("connect", "/notifications", sid, {}, auth)
    assert admitted == [str(user.id)]
    assert await redis.scard(f"sio:user:<{user.id}>:sockets") == 1
