"""PermissionCacheManagerImpl.get_role_codes / get_catalog_version 与 PermissionCatalogReaderImpl 测试。"""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from plugin_permission import providers, register
from plugin_permission.cache import CachedPermissions
from rapidkit_common.protocols.permission import PermissionCatalogReader


@asynccontextmanager
async def fake_session_factory():
    yield MagicMock()


@pytest.mark.asyncio
async def test_get_role_codes_returns_expanded_codes_of_role_combination(monkeypatch: pytest.MonkeyPatch):
    resolver = MagicMock()
    resolver.resolve = AsyncMock(return_value=CachedPermissions(codes=["user:update", "user:read"]))
    resolver_cls = MagicMock(return_value=resolver)
    monkeypatch.setattr(providers, "AuthRoleResolver", resolver_cls)
    monkeypatch.setattr(providers.RedisManager, "client", MagicMock(return_value=AsyncMock()))
    manager = providers.PermissionCacheManagerImpl(session_factory=fake_session_factory)

    assert await manager.get_role_codes(["viewer"]) == {"user:read", "user:update"}
    resolver.resolve.assert_awaited_once_with(["viewer"])


@pytest.mark.asyncio
async def test_get_catalog_version_delegates_to_catalog_version_module(monkeypatch: pytest.MonkeyPatch):
    redis = AsyncMock()
    read = AsyncMock(return_value=7)
    monkeypatch.setattr(providers.RedisManager, "client", MagicMock(return_value=redis))
    monkeypatch.setattr(providers, "read_catalog_version", read)
    manager = providers.PermissionCacheManagerImpl(session_factory=fake_session_factory)

    assert await manager.get_catalog_version() == 7
    read.assert_awaited_once_with(redis)


def test_catalog_reader_checks_effective_catalog(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(providers, "get_catalog", lambda: SimpleNamespace(codes={"user:read": object()}))
    reader = providers.PermissionCatalogReaderImpl()

    assert reader.has_code("user:read")
    assert not reader.has_code("user:export")


def test_register_provides_catalog_reader():
    assert PermissionCatalogReader in register().provides
