"""目录运行时测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef

from plugin_permission.catalog import runtime
from plugin_permission.catalog.registry import get_catalog

MANIFESTS = [
    PluginManifest(
        name="demo",
        version="0.1.0",
        resources=[ResourceDef(key="user", label="用户")],
        permission_codes=[PermissionCodeDef(code="user:read", label="查看用户", abac_action="read")],
    )
]
BINDINGS = {"GET:/api/v1/users": "user:read"}


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.read_calls = 0

    async def get(self, key, **_):
        return self.data.get(key)

    async def set(self, key, value, *, ex=None, nx=False):
        if nx and key in self.data:
            return None
        self.data[key] = str(value)
        return True

    async def mget(self, keys):
        self.read_calls += 1
        return [self.data.get(k) for k in keys]

    async def incr(self, key):
        self.data[key] = str(int(self.data.get(key, "0")) + 1)
        return int(self.data[key])


def _row(**fields):
    base = dict(id=None, route_key=None, depends_on=None, resource=None, label=None, abac_action=None)
    base.update(fields)
    return SimpleNamespace(**base)


async def test_rebuild_merges_extensions_from_db(monkeypatch):
    runtime.init_catalog_runtime(MANIFESTS, BINDINGS)
    rows = [_row(kind="custom_code", code="user:audit", resource="user", label="审计", abac_action="read")]
    monkeypatch.setattr(runtime, "load_extension_rows", AsyncMock(return_value=rows))

    catalog = await runtime.rebuild_catalog(object())

    assert "user:audit" in catalog.codes
    assert get_catalog() is catalog
    assert "user:audit" not in runtime.get_baseline_catalog().codes


async def test_bump_marks_local_version(monkeypatch):
    redis = FakeRedis()
    version = await runtime.bump_catalog_version(redis)
    assert runtime.local_catalog_version() == version
    assert int(redis.data[runtime.CATALOG_VERSION_KEY]) == version


async def test_ensure_fresh_rebuilds_on_version_change_and_throttles(monkeypatch):
    runtime.init_catalog_runtime(MANIFESTS, BINDINGS)
    redis = FakeRedis()
    rebuild = AsyncMock()
    monkeypatch.setattr(runtime, "rebuild_catalog", rebuild)
    clock = iter([100.0, 100.5, 102.0, 104.0])
    monkeypatch.setattr(runtime, "time", SimpleNamespace(monotonic=lambda: next(clock)))

    runtime.mark_catalog_version(1)
    redis.data[runtime.CATALOG_VERSION_KEY] = "1"
    await runtime.ensure_catalog_fresh(redis, object())  # t=100 读取，版本一致
    assert rebuild.await_count == 0

    redis.data[runtime.CATALOG_VERSION_KEY] = "2"
    await runtime.ensure_catalog_fresh(redis, object())  # t=100.5 节流，不读取
    assert redis.read_calls == 1
    assert rebuild.await_count == 0

    await runtime.ensure_catalog_fresh(redis, object())  # t=102 读取，版本变化 → 重建
    assert rebuild.await_count == 1
    assert runtime.local_catalog_version() == 2

    await runtime.ensure_catalog_fresh(redis, object())  # t=104 读取，已一致
    assert rebuild.await_count == 1
