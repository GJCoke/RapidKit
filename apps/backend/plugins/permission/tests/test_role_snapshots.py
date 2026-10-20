"""角色快照缓存与 AuthRoleResolver 测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from plugin_permission import adapters
from plugin_permission.adapters import AuthRoleResolver
from plugin_permission.cache import RoleSnapshot
from plugin_permission.catalog.registry import set_catalog
from plugin_permission.role_snapshots import load_role_snapshots, role_snapshot_key
from plugins.permission.tests.catalog_fixtures import make_scoped_catalog
from rapidkit_common.enums import Status


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    async def get(self, key, **_):
        return self.data.get(key)

    async def set(self, key, value, *, ex=None, nx=False):
        if nx and key in self.data:
            return None
        self.data[key] = value if isinstance(value, str) else str(value)
        return True

    async def mget(self, keys):
        return [self.data.get(k) for k in keys]

    async def incr(self, key):
        self.data[key] = str(int(self.data[key]) + 1)
        return int(self.data[key])

    def lock(self, name, timeout=None, blocking=True):
        lock = MagicMock()
        lock.acquire = AsyncMock(return_value=True)
        lock.release = AsyncMock()
        return lock


def _role(code: str, status: Status = Status.ON, **fields):
    return SimpleNamespace(
        code=code,
        status=status,
        permission_codes=fields.get("permission_codes", []),
        router_permissions=fields.get("router_permissions", []),
        data_scopes=fields.get("data_scopes", {}),
        field_modes=fields.get("field_modes", {}),
    )


def _crud(*roles):
    by_code = {r.code: r for r in roles}
    crud = MagicMock()
    crud.get_role_by_codes = AsyncMock(side_effect=lambda codes: [by_code[c] for c in codes if c in by_code])
    return crud


async def test_snapshots_are_cached_per_version():
    redis = FakeRedis()
    crud = _crud(_role("editor", permission_codes=["user:update"]))

    first = await load_role_snapshots(redis, crud, {"editor": 7}, 1)
    second = await load_role_snapshots(redis, crud, {"editor": 7}, 1)

    assert first == second
    assert first[0].permission_codes == ["user:update"]
    assert role_snapshot_key("editor", 7, 1) == "auth:role:editor:c1:v7"
    assert role_snapshot_key("editor", 7, 1) in redis.data
    assert crud.get_role_by_codes.await_count == 1


async def test_new_role_version_rebuilds_snapshot():
    redis = FakeRedis()
    crud = _crud(_role("editor"))

    await load_role_snapshots(redis, crud, {"editor": 7}, 1)
    await load_role_snapshots(redis, crud, {"editor": 8}, 1)

    assert crud.get_role_by_codes.await_count == 2


async def test_new_catalog_version_rebuilds_snapshot():
    redis = FakeRedis()
    crud = _crud(_role("editor"))

    await load_role_snapshots(redis, crud, {"editor": 7}, 1)
    await load_role_snapshots(redis, crud, {"editor": 7}, 2)

    assert crud.get_role_by_codes.await_count == 2


async def test_missing_role_is_negative_cached():
    redis = FakeRedis()
    crud = _crud()

    [snapshot] = await load_role_snapshots(redis, crud, {"ghost": 1}, 1)
    await load_role_snapshots(redis, crud, {"ghost": 1}, 1)

    assert snapshot.active is False
    assert crud.get_role_by_codes.await_count == 1


def test_snapshot_has_no_legacy_router_permissions():
    assert "legacy_router_permissions" not in RoleSnapshot.model_fields


async def test_snapshot_carries_role_scopes():
    redis = FakeRedis()
    crud = _crud(_role("editor", data_scopes={"item": "dept"}, field_modes={"item": {"contact": "masked"}}))

    [snapshot] = await load_role_snapshots(redis, crud, {"editor": 1}, 1)

    assert snapshot.data_scopes == {"item": "dept"}
    assert snapshot.field_modes == {"item": {"contact": "masked"}}


async def test_resolver_merges_active_role_scopes(monkeypatch):
    set_catalog(make_scoped_catalog())
    monkeypatch.setattr(adapters, "get_permission_versions", AsyncMock(return_value=({"a": 1, "b": 1, "c": 1}, 1)))
    snapshots = [
        RoleSnapshot(
            code="a",
            active=True,
            permission_codes=["item:read"],
            data_scopes={"item": "self"},
            field_modes={"item": {"contact": "hidden"}},
        ),
        RoleSnapshot(code="b", active=True, data_scopes={"item": "dept"}, field_modes={"item": {"contact": "masked"}}),
        RoleSnapshot(code="c", active=False, data_scopes={}),
    ]
    monkeypatch.setattr(adapters, "load_role_snapshots", AsyncMock(return_value=snapshots))

    cached = await AuthRoleResolver(MagicMock(session=None), object()).resolve(["a", "b", "c"])

    assert cached.codes == ["item:read"]
    assert cached.data_scopes == {"item": ["dept", "self"]}
    assert cached.field_modes == {"item": {"contact": "masked"}}
