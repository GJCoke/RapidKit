"""Tests for SessionInvalidator protocol and implementation."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_auth.providers import SessionInvalidatorImpl
from rapidkit_common.protocols.auth import SessionInvalidator, UserSocketCloser
from rapidkit_common.protocols.impersonation import ImpersonationRevoker


class TestSessionInvalidatorProtocol:
    def test_protocol_has_required_methods(self):
        assert hasattr(SessionInvalidator, "invalidate_user_sessions")
        assert hasattr(SessionInvalidator, "invalidate_permission_cache")
        assert hasattr(SessionInvalidator, "invalidate_user_cache")

    def test_impl_satisfies_protocol(self):
        impl = SessionInvalidatorImpl()
        # Duck-type check
        assert hasattr(impl, "invalidate_user_sessions")
        assert hasattr(impl, "invalidate_permission_cache")
        assert hasattr(impl, "invalidate_user_cache")


class AsyncIteratorMock:
    def __init__(self, items):
        self._items = iter(items)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._items)
        except StopIteration:
            raise StopAsyncIteration


class TestSessionInvalidatorImpl:
    @pytest.mark.asyncio
    async def test_invalidate_permission_cache_deletes_key(self):
        redis = AsyncMock()
        impl = SessionInvalidatorImpl()
        user_id = uuid4()

        await impl.invalidate_permission_cache(user_id, redis)

        redis.delete.assert_called_once_with(f"auth:permission:<{user_id}>")

    @pytest.mark.asyncio
    async def test_invalidate_user_cache_deletes_key(self):
        redis = AsyncMock()
        impl = SessionInvalidatorImpl()
        user_id = uuid4()

        await impl.invalidate_user_cache(user_id, redis)

        redis.delete.assert_called_once_with(f"auth:user:<{user_id}>")

    @pytest.mark.asyncio
    async def test_invalidate_user_sessions_full_flow(self):
        from unittest.mock import MagicMock

        redis = AsyncMock()
        redis.scan_iter = MagicMock(
            return_value=AsyncIteratorMock([b"auth:refresh:<uid>:<jti1>", b"auth:refresh:<uid>:<jti2>"])
        )
        impl = SessionInvalidatorImpl()
        user_id = uuid4()

        await impl.invalidate_user_sessions(user_id, redis)

        # Should delete permission cache
        redis.delete.assert_any_call(f"auth:permission:<{user_id}>")
        # Should delete each refresh token
        redis.delete.assert_any_call(b"auth:refresh:<uid>:<jti1>")
        redis.delete.assert_any_call(b"auth:refresh:<uid>:<jti2>")
        # Should set force relogin flag
        redis.set.assert_called_once_with(f"auth:force_relogin:<{user_id}>", "1", ex=86400)


@pytest.fixture(autouse=True)
def optional_revoker_absent(monkeypatch):
    """Unit tests exercise the original contract with no impersonation plugin."""
    monkeypatch.setattr("plugin_auth.providers.get_service_optional", lambda protocol: None)


@pytest.mark.asyncio
async def test_invalidator_calls_optional_revoker(monkeypatch):
    revoker = AsyncMock()
    monkeypatch.setattr(
        "plugin_auth.providers.get_service_optional",
        lambda protocol: revoker if protocol is ImpersonationRevoker else None,
    )
    redis = AsyncMock()
    redis.scan_iter = lambda **kwargs: AsyncIteratorMock([])
    user_id = uuid4()
    await SessionInvalidatorImpl().invalidate_user_sessions(user_id, redis)
    revoker.revoke_user.assert_awaited_once_with(user_id, redis)


@pytest.mark.asyncio
async def test_invalidate_user_sessions_closes_user_sockets(monkeypatch):
    closer = AsyncMock()
    monkeypatch.setattr(
        "plugin_auth.providers.get_service_optional", lambda protocol: closer if protocol is UserSocketCloser else None
    )
    redis = AsyncMock()
    redis.scan_iter = lambda **kwargs: AsyncIteratorMock([])
    user_id = uuid4()
    await SessionInvalidatorImpl().invalidate_user_sessions(user_id, redis)
    closer.close_user.assert_awaited_once_with(user_id, redis)
