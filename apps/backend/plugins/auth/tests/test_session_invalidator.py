"""Tests for SessionInvalidator protocol and implementation."""

import pytest
from unittest.mock import AsyncMock
from uuid import uuid4

from rapidkit_common.protocols.auth import SessionInvalidator
from plugin_auth.providers import SessionInvalidatorImpl


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
            return_value=AsyncIteratorMock(
                [b"auth:refresh:<uid>:<jti1>", b"auth:refresh:<uid>:<jti2>"]
            )
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
        redis.set.assert_called_once_with(
            f"auth:force_relogin:<{user_id}>", "1", ex=86400
        )
