"""Redis 目录版本更新发生于节流窗口内时，缓存与本进程目录必须保持一致。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from rapidkit_common.enums import Status
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef

from plugin_permission import user_permissions
from plugin_permission.adapters import AuthRoleResolver
from plugin_permission.cache import CachedPermissions
from plugin_permission.catalog import runtime
from plugin_permission.catalog.registry import get_catalog, set_catalog
from plugins.permission.tests.test_role_snapshots import FakeRedis

USER_ID = UUID(int=123)


@pytest.fixture
def changed_catalog(monkeypatch):
    manifest = PluginManifest(
        name="user", version="1", resources=[ResourceDef(key="user", label="用户")],
        permission_codes=[PermissionCodeDef(code="user:read", label="查看用户", abac_action="read")],
    )
    set_catalog(runtime.init_catalog_runtime([manifest], {"GET:/users": "user:read"}))
    runtime.mark_catalog_version(1)
    monkeypatch.setattr(runtime, "time", SimpleNamespace(monotonic=lambda: 100.5))
    monkeypatch.setattr(runtime._state, "checked_at", 100.0)
    rows = [
        SimpleNamespace(id=None, kind="custom_code", code="user:audit", resource="user", label="审计",
                        abac_action="read", route_key=None, depends_on=None),
        SimpleNamespace(id=None, kind="depends", code="user:read", resource=None, label=None,
                        abac_action=None, route_key=None, depends_on="user:audit"),
    ]
    monkeypatch.setattr(runtime, "load_extension_rows", AsyncMock(return_value=rows))
    redis = FakeRedis()
    redis.data.update({"auth:permission_catalog_version": "2", "auth:role_version:editor": "1"})
    role = SimpleNamespace(code="editor", status=Status.ON, permission_codes=["user:read"],
                           router_permissions=[], data_scopes={}, field_modes={})
    crud = MagicMock(get_role_by_codes=AsyncMock(return_value=[role]))
    return redis, crud


async def test_new_cache_is_never_marked_with_version_of_an_old_catalog(changed_catalog):
    redis, crud = changed_catalog

    cached = await AuthRoleResolver(crud, redis).resolve(["editor"])

    assert cached.catalog_version == 2
    assert cached.codes == ["user:audit", "user:read"]
    assert runtime.local_catalog_version() == 2


async def test_shared_fresh_cache_also_refreshes_this_process_catalog(changed_catalog, monkeypatch):
    redis, crud = changed_catalog
    cached = CachedPermissions(codes=["user:audit", "user:read"], role_versions={"editor": 1}, catalog_version=2)
    cache = MagicMock(get=AsyncMock(return_value=cached), set=AsyncMock())
    monkeypatch.setattr(user_permissions, "build_permission_cache", lambda _: cache)

    result, _ = await user_permissions.get_fresh_permissions(USER_ID, ["editor"], redis, crud)

    assert result is cached
    assert "user:audit" in get_catalog().codes
    assert runtime.local_catalog_version() == 2
    cache.set.assert_not_awaited()
