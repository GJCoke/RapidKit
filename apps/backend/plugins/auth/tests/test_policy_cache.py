"""Unit tests for policy cache and role versioning."""

from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from plugin_permission.cache import CachedPermissions

from plugin_permission.adapters import RedisPermissionCache
from plugin_permission.data_policy.services import invalidate_policy_cache
from plugin_permission.role.schemas import UserPermissionCache


class TestInvalidatePolicyCache:
    @pytest.mark.asyncio
    async def test_invalidate_deletes_policy_key(self):
        """invalidate_policy_cache should delete the policy cache key."""
        redis = AsyncMock()
        redis.delete = AsyncMock()

        await invalidate_policy_cache(redis, UUID("00000000-0000-0000-0000-000000000001"))

        redis.delete.assert_called_once_with("auth:policy:00000000-0000-0000-0000-000000000001")

    @pytest.mark.asyncio
    async def test_invalidate_without_session_does_not_bump_versions(self):
        """Without session, only the policy cache is deleted."""
        redis = AsyncMock()
        redis.delete = AsyncMock()
        redis.incr = AsyncMock()

        await invalidate_policy_cache(redis, UUID("00000000-0000-0000-0000-000000000001"))

        redis.incr.assert_not_called()


class TestUserPermissionCacheVersion:
    def test_cache_includes_role_versions(self):
        cache = UserPermissionCache(
            permissions=["GET:/users"],
            buttons=["add"],
            data_policy_ids=[],
            role_versions={"ADMIN": 3},
        )
        assert cache.role_versions == {"ADMIN": 3}

    def test_cache_default_role_versions_is_empty(self):
        cache = UserPermissionCache(permissions=[], buttons=[], data_policy_ids=[])
        assert cache.role_versions == {}


class TestRedisPermissionCacheSet:
    """Cache set must persist even for ABAC-only users (empty permissions/buttons)."""

    @pytest.mark.asyncio
    async def test_set_persists_abac_only_user(self):
        """When a user has only data_policy_ids but no permissions/buttons, cache must still be written."""
        redis = AsyncMock()
        redis.set = AsyncMock()

        cache = RedisPermissionCache(redis, "auth:permission:<{user_id}>", timedelta(hours=1))
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        data = CachedPermissions(
            permissions=[],
            buttons=[],
            data_policy_ids=[UUID("00000000-0000-0000-0000-000000000099")],
            role_versions={"user": 1},
        )

        await cache.set(user_id, data)

        redis.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_persists_empty_permissions_with_version(self):
        """Even fully empty cache should be persisted to record role_versions."""
        redis = AsyncMock()
        redis.set = AsyncMock()

        cache = RedisPermissionCache(redis, "auth:permission:<{user_id}>", timedelta(hours=1))
        user_id = UUID("00000000-0000-0000-0000-000000000002")
        data = CachedPermissions(permissions=[], buttons=[], data_policy_ids=[], role_versions={"user": 5})

        await cache.set(user_id, data)

        redis.set.assert_called_once()
