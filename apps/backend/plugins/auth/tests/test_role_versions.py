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
    async def test_missing_version_is_seeded_not_zero(self):
        redis = AsyncMock()
        redis.mget.side_effect = [["3", "7", None], ["3", "7", "1760000000000"]]
        result = await get_role_versions(redis, ["ADMIN", "EDITOR", "VIEWER"])
        assert result == {"ADMIN": 3, "EDITOR": 7, "VIEWER": 1760000000000}
        redis.mget.assert_called_with([
            "auth:role_version:ADMIN",
            "auth:role_version:EDITOR",
            "auth:role_version:VIEWER",
        ])
        assert redis.set.await_args.args[0] == "auth:role_version:VIEWER"
        assert redis.set.await_args.kwargs == {"nx": True}


class TestIncrRoleVersion:
    @pytest.mark.asyncio
    async def test_increments_role_version(self):
        redis = AsyncMock()
        redis.incr.return_value = 4
        result = await incr_role_version(redis, "ADMIN")
        assert result == 4
        redis.set.assert_awaited_once()
        assert redis.set.await_args.kwargs == {"nx": True}
        redis.incr.assert_called_once_with("auth:role_version:ADMIN")
