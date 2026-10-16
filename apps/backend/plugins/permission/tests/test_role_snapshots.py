"""角色快照缓存与 AuthRoleResolver 测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from rapidkit_common.enums import Status

from plugin_permission.adapters import AuthRoleResolver
from plugin_permission.role_snapshots import load_role_snapshots, role_snapshot_key

POLICY_ID = UUID("00000000-0000-0000-0000-000000000001")


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

    def lock(self, name, timeout=None, blocking=True):
        lock = MagicMock()
        lock.acquire = AsyncMock(return_value=True)
        lock.release = AsyncMock()
        return lock


def _role(code: str, status: Status = Status.ON, **fields):
    return SimpleNamespace(
        code=code,
        status=status,
        interface_permissions=fields.get("interface_permissions", []),
        button_permissions=fields.get("button_permissions", []),
        router_permissions=fields.get("router_permissions", []),
        data_policy_ids=fields.get("data_policy_ids", []),
        field_policy_ids=fields.get("field_policy_ids", []),
    )


def _crud(*roles):
    by_code = {r.code: r for r in roles}
    crud = MagicMock()
    crud.get_role_by_codes = AsyncMock(side_effect=lambda codes: [by_code[c] for c in codes if c in by_code])
    return crud


async def test_snapshots_are_cached_per_version():
    redis = FakeRedis()
    crud = _crud(_role("editor", button_permissions=["edit"]))

    first = await load_role_snapshots(redis, crud, {"editor": 7})
    second = await load_role_snapshots(redis, crud, {"editor": 7})

    assert first == second
    assert first[0].button_permissions == ["edit"]
    assert role_snapshot_key("editor", 7) in redis.data
    assert crud.get_role_by_codes.await_count == 1


async def test_new_version_rebuilds_snapshot():
    redis = FakeRedis()
    crud = _crud(_role("editor"))

    await load_role_snapshots(redis, crud, {"editor": 7})
    await load_role_snapshots(redis, crud, {"editor": 8})

    assert crud.get_role_by_codes.await_count == 2


async def test_missing_role_is_negative_cached():
    redis = FakeRedis()
    crud = _crud()

    [snapshot] = await load_role_snapshots(redis, crud, {"ghost": 1})
    await load_role_snapshots(redis, crud, {"ghost": 1})

    assert snapshot.active is False
    assert crud.get_role_by_codes.await_count == 1


async def test_resolver_skips_disabled_roles():
    redis = FakeRedis()
    redis.data["auth:role_version:editor"] = "3"
    redis.data["auth:role_version:viewer"] = "5"
    crud = _crud(
        _role("editor", interface_permissions=["GET:/a"], button_permissions=["edit"], data_policy_ids=[POLICY_ID]),
        _role("viewer", status=Status.OFF, interface_permissions=["GET:/b"], button_permissions=["view"]),
    )

    cached = await AuthRoleResolver(crud, redis).resolve(["editor", "viewer"])

    assert cached.permissions == ["GET:/a"]
    assert cached.buttons == ["edit"]
    assert cached.data_policy_ids == [POLICY_ID]
    assert cached.role_versions == {"editor": 3, "viewer": 5}
