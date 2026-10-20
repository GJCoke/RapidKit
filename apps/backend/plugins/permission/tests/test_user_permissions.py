"""get_fresh_permissions 与 PermissionCacheManagerImpl 测试。"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from plugin_permission import providers, user_permissions
from plugin_permission.cache import CachedPermissions
from plugins.permission.tests.catalog_fixtures import install_catalog

USER_ID = UUID("00000000-0000-0000-0000-0000000000aa")


def _patch(monkeypatch, cached, versions, rebuilt, catalog_version=1):
    cache = MagicMock(get=AsyncMock(return_value=cached), set=AsyncMock())
    monkeypatch.setattr(user_permissions, "build_permission_cache", lambda redis: cache)
    monkeypatch.setattr(
        user_permissions, "get_permission_versions", AsyncMock(return_value=(versions, catalog_version))
    )
    resolver = MagicMock(resolve=AsyncMock(return_value=rebuilt))
    monkeypatch.setattr(user_permissions, "AuthRoleResolver", MagicMock(return_value=resolver))
    return cache, resolver


async def test_fresh_cache_is_returned(monkeypatch):
    cached = CachedPermissions(codes=["old"], role_versions={"editor": 3}, catalog_version=1)
    cache, resolver = _patch(monkeypatch, cached, {"editor": 3}, None)

    result, versions = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], object(), MagicMock())

    assert result is cached
    assert versions == {"editor": 3}
    resolver.resolve.assert_not_awaited()
    cache.set.assert_not_awaited()


async def test_stale_role_version_is_rebuilt_and_written(monkeypatch):
    cached = CachedPermissions(codes=["old"], role_versions={"editor": 3}, catalog_version=1)
    rebuilt = CachedPermissions(codes=["new"], role_versions={"editor": 4}, catalog_version=1)
    cache, resolver = _patch(monkeypatch, cached, {"editor": 4}, rebuilt)

    result, versions = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], object(), MagicMock())

    assert result.codes == ["new"]
    assert versions == {"editor": 4}
    cache.set.assert_awaited_once_with(USER_ID, rebuilt)


async def test_stale_catalog_version_is_rebuilt(monkeypatch):
    cached = CachedPermissions(codes=["old"], role_versions={"editor": 3}, catalog_version=1)
    rebuilt = CachedPermissions(codes=["new"], role_versions={"editor": 3}, catalog_version=2)
    cache, resolver = _patch(monkeypatch, cached, {"editor": 3}, rebuilt, catalog_version=2)

    result, _ = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], object(), MagicMock())

    assert result.codes == ["new"]
    resolver.resolve.assert_awaited_once()


@asynccontextmanager
async def _session_factory():
    yield object()


async def test_get_buttons_returns_only_expanded_codes(monkeypatch):
    install_catalog()
    fresh = AsyncMock(return_value=(CachedPermissions(codes=["user:read", "user:delete"]), {}))
    monkeypatch.setattr(providers, "get_fresh_permissions", fresh)
    manager = providers.PermissionCacheManagerImpl(session_factory=_session_factory)

    buttons = await manager.get_buttons(USER_ID, ["editor"], object())

    assert buttons == ["user:delete", "user:read"]
    fresh.assert_awaited_once()


async def test_get_restricted_fields_maps_modes_to_fields(monkeypatch):
    from plugin_permission.catalog.registry import set_catalog
    from plugins.permission.tests.catalog_fixtures import make_scoped_catalog

    set_catalog(make_scoped_catalog())
    cached = CachedPermissions(codes=["item:read"], field_modes={"item": {"contact": "masked"}})
    monkeypatch.setattr(providers, "get_fresh_permissions", AsyncMock(return_value=(cached, {})))
    manager = providers.PermissionCacheManagerImpl(session_factory=_session_factory)

    fields = await manager.get_restricted_fields(USER_ID, ["editor"], object())

    assert fields == {"item": {"phone": "masked", "email": "masked"}}
