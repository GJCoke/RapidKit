"""get_fresh_permissions 与 PermissionCacheManagerImpl 测试。"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from plugin_permission import providers, user_permissions
from plugin_permission.cache import CachedPermissions

USER_ID = UUID("00000000-0000-0000-0000-0000000000aa")


def _patch(monkeypatch, cached, versions, rebuilt):
    cache = MagicMock(get=AsyncMock(return_value=cached), set=AsyncMock())
    monkeypatch.setattr(user_permissions, "build_permission_cache", lambda redis: cache)
    monkeypatch.setattr(user_permissions, "get_role_versions", AsyncMock(return_value=versions))
    resolver = MagicMock(resolve=AsyncMock(return_value=rebuilt))
    monkeypatch.setattr(user_permissions, "AuthRoleResolver", MagicMock(return_value=resolver))
    return cache, resolver


async def test_fresh_cache_is_returned(monkeypatch):
    cached = CachedPermissions(buttons=["old"], role_versions={"editor": 3})
    cache, resolver = _patch(monkeypatch, cached, {"editor": 3}, None)

    result, versions = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], object(), object())

    assert result is cached
    assert versions == {"editor": 3}
    resolver.resolve.assert_not_awaited()
    cache.set.assert_not_awaited()


async def test_stale_cache_is_rebuilt_and_written(monkeypatch):
    cached = CachedPermissions(buttons=["old"], role_versions={"editor": 3})
    rebuilt = CachedPermissions(buttons=["new"], role_versions={"editor": 4})
    cache, resolver = _patch(monkeypatch, cached, {"editor": 4}, rebuilt)

    result, versions = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], object(), object())

    assert result.buttons == ["new"]
    assert versions == {"editor": 4}
    cache.set.assert_awaited_once_with(USER_ID, rebuilt)


async def test_get_buttons_checks_versions(monkeypatch):
    fresh = AsyncMock(return_value=(CachedPermissions(buttons=["new"]), {}))
    monkeypatch.setattr(providers, "get_fresh_permissions", fresh)

    @asynccontextmanager
    async def session_factory():
        yield object()

    manager = providers.PermissionCacheManagerImpl(session_factory=session_factory)

    assert await manager.get_buttons(USER_ID, ["editor"], object()) == ["new"]
    fresh.assert_awaited_once()
