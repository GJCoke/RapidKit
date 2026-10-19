# apps/backend/plugins/permission/tests/test_catalog_version.py
"""目录版本同步与批量读取测试。"""

from plugin_permission.catalog.version import (
    CATALOG_DIGEST_KEY,
    CATALOG_VERSION_KEY,
    get_permission_versions,
    sync_catalog_version,
)


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    async def get(self, key, **_):
        return self.data.get(key)

    async def set(self, key, value, *, ex=None, nx=False):
        if nx and key in self.data:
            return None
        self.data[key] = str(value)
        return True

    async def mget(self, keys):
        return [self.data.get(k) for k in keys]

    async def incr(self, key):
        self.data[key] = str(int(self.data[key]) + 1)
        return int(self.data[key])


async def test_digest_change_bumps_version():
    redis = FakeRedis()

    first = await sync_catalog_version(redis, "aaa")
    same = await sync_catalog_version(redis, "aaa")
    changed = await sync_catalog_version(redis, "bbb")

    assert same == first
    assert changed == first + 1
    assert redis.data[CATALOG_DIGEST_KEY] == "bbb"


async def test_permission_versions_read_roles_and_catalog_together():
    redis = FakeRedis()
    redis.data["auth:role_version:editor"] = "3"
    redis.data[CATALOG_VERSION_KEY] = "9"

    roles, catalog = await get_permission_versions(redis, ["editor"])

    assert roles == {"editor": 3}
    assert catalog == 9


async def test_missing_catalog_version_is_seeded():
    redis = FakeRedis()

    roles, catalog = await get_permission_versions(redis, [])

    assert roles == {}
    assert catalog > 0
    assert redis.data[CATALOG_VERSION_KEY] == str(catalog)
