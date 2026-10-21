"""Redis 代码目录版本变化时，角色快照与用户权限缓存保持一致。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from plugin_permission import user_permissions
from plugin_permission.adapters import AuthRoleResolver
from plugin_permission.cache import CachedPermissions
from plugin_permission.catalog.registry import build_catalog, set_catalog
from plugins.permission.tests.test_role_snapshots import FakeRedis
from rapidkit_common.enums import Status
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef

USER_ID = UUID(int=123)


@pytest.fixture
def changed_catalog(monkeypatch):
    manifest = PluginManifest(
        name="user",
        version="1",
        resources=[ResourceDef(key="user", label="用户")],
        permission_codes=[PermissionCodeDef(code="user:read", label="查看用户", abac_action="read")],
    )
    set_catalog(build_catalog([manifest], {"GET:/users": "user:read"}))
    redis = FakeRedis()
    redis.data.update({"auth:permission_catalog_version": "2", "auth:role_version:editor": "1"})
    role = SimpleNamespace(
        code="editor",
        status=Status.ON,
        permission_codes=["user:read"],
        data_scopes={},
        field_modes={},
    )
    crud = MagicMock(get_role_by_codes=AsyncMock(return_value=[role]))
    return redis, crud


async def test_new_cache_is_never_marked_with_version_of_an_old_catalog(changed_catalog):
    redis, crud = changed_catalog

    cached = await AuthRoleResolver(crud, redis).resolve(["editor"])

    assert cached.catalog_version == 2
    assert cached.codes == ["user:read"]


async def test_shared_fresh_cache_is_reused_for_static_catalog(changed_catalog, monkeypatch):
    redis, crud = changed_catalog
    cached = CachedPermissions(codes=["user:read"], role_versions={"editor": 1}, catalog_version=2)
    cache = MagicMock(get=AsyncMock(return_value=cached), set=AsyncMock())
    monkeypatch.setattr(user_permissions, "build_permission_cache", lambda _: cache)

    result, _ = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], redis, crud)

    assert result is cached
    cache.set.assert_not_awaited()
