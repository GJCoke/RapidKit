"""Tests for per-role version functions."""

from unittest.mock import AsyncMock

import pytest

from plugin_permission.data_policy.services import get_role_versions, incr_role_version


class TestGetRoleVersions:
    @pytest.mark.asyncio
    async def test_empty_codes_returns_empty(self):
        redis = AsyncMock()
        result = await get_role_versions(redis, [])
        assert result == {}
        redis.mget.assert_not_called()

    @pytest.mark.asyncio
    async def test_fetches_versions_via_mget(self):
        redis = AsyncMock()
        redis.mget.return_value = ["3", "7", None]
        result = await get_role_versions(redis, ["ADMIN", "EDITOR", "VIEWER"])
        assert result == {"ADMIN": 3, "EDITOR": 7, "VIEWER": 0}
        redis.mget.assert_called_once_with([
            "auth:role_version:ADMIN",
            "auth:role_version:EDITOR",
            "auth:role_version:VIEWER",
        ])


class TestIncrRoleVersion:
    @pytest.mark.asyncio
    async def test_increments_role_version(self):
        redis = AsyncMock()
        redis.incr.return_value = 4
        result = await incr_role_version(redis, "ADMIN")
        assert result == 4
        redis.incr.assert_called_once_with("auth:role_version:ADMIN")
