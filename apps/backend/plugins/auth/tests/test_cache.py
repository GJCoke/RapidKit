"""Tests for permission cache protocol implementations."""

from uuid import uuid4

import pytest
from plugin_permission.cache import CachedPermissions, InMemoryPermissionCache


@pytest.fixture
def cache():
    return InMemoryPermissionCache()


@pytest.mark.asyncio
async def test_get_returns_none_for_missing_user(cache):
    assert await cache.get(uuid4()) is None


@pytest.mark.asyncio
async def test_set_and_get_roundtrip(cache):
    uid = uuid4()
    data = CachedPermissions(permissions=["GET:/api/users"], buttons=["btn:delete"], role_versions={"ADMIN": 3})
    await cache.set(uid, data)
    result = await cache.get(uid)
    assert result is not None
    assert result.permissions == ["GET:/api/users"]
    assert result.role_versions == {"ADMIN": 3}


@pytest.mark.asyncio
async def test_invalidate_removes_entry(cache):
    uid = uuid4()
    await cache.set(uid, CachedPermissions())
    await cache.invalidate(uid)
    assert await cache.get(uid) is None
