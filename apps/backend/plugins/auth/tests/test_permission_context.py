"""Tests for PermissionContext."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from plugin_permission.context import PermissionContext


class TestPermissionContext:
    def test_is_stale_when_versions_mismatch(self):
        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={"ADMIN": 3, "EDITOR": 5},
            current_role_versions={"ADMIN": 3, "EDITOR": 7},
        )
        assert ctx.is_stale is True

    def test_not_stale_when_versions_match(self):
        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={"ADMIN": 3, "EDITOR": 5},
            current_role_versions={"ADMIN": 3, "EDITOR": 5},
        )
        assert ctx.is_stale is False

    def test_stale_when_new_role_added(self):
        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={"ADMIN": 3},
            current_role_versions={"ADMIN": 3, "EDITOR": 1},
        )
        assert ctx.is_stale is True

    @pytest.mark.asyncio
    async def test_get_policies_caches_result(self):
        loader = AsyncMock()
        policy = MagicMock()
        policy.id = uuid4()
        loader.load.return_value = [policy]

        ctx = PermissionContext(
            user=MagicMock(),
            cached_role_versions={},
            current_role_versions={},
            data_policy_ids=[policy.id],
        )
        result1 = await ctx.get_policies(loader)
        result2 = await ctx.get_policies(loader)

        assert result1 == result2
        loader.load.assert_called_once()
