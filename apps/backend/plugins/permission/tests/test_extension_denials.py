"""被拒码记录与聚合测试。"""

from datetime import datetime, timedelta
from uuid import UUID

from plugin_permission.extension import denials

USER = UUID("00000000-0000-0000-0000-0000000000aa")


class FakeRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}
        self.ttl: dict[str, timedelta] = {}

    async def hincrby(self, name, key, amount=1):
        bucket = self.hashes.setdefault(name, {})
        bucket[key] = str(int(bucket.get(key, "0")) + amount)
        return int(bucket[key])

    async def hset(self, name, key=None, value=None, mapping=None, items=None):
        self.hashes.setdefault(name, {})[key] = value
        return 1

    async def hgetall(self, name, **_):
        return dict(self.hashes.get(name, {}))

    async def expire(self, name, time):
        self.ttl[name] = time
        return True


class BrokenRedis(FakeRedis):
    async def hincrby(self, name, key, amount=1):
        raise ConnectionError("down")


async def test_record_and_list_aggregates_across_days(monkeypatch):
    redis = FakeRedis()
    day1 = datetime(2026, 10, 16, 8, 0, 0)
    day2 = datetime(2026, 10, 17, 9, 30, 0)

    monkeypatch.setattr(denials.timezone, "now", lambda: day1)
    await denials.record_denial(
        redis, user_id=USER, code="user:update", route_key="GET:/api/v1/positions/all", role_versions={"r": 1}, catalog_version=3
    )
    monkeypatch.setattr(denials.timezone, "now", lambda: day2)
    await denials.record_denial(
        redis, user_id=USER, code="user:update", route_key="GET:/api/v1/positions/all", role_versions={"r": 1}, catalog_version=3
    )
    await denials.record_denial(
        redis, user_id=USER, code="role:read", route_key="GET:/api/v1/roles", role_versions={}, catalog_version=3
    )

    assert redis.ttl["auth:denials:20261017"] == timedelta(days=denials.DENIAL_RETENTION_DAYS)

    records = await denials.list_recent_denials(redis, days=7, labels={"user:update": "编辑用户"})
    assert [(r.code, r.route_key, r.count) for r in records] == [
        ("user:update", "GET:/api/v1/positions/all", 2),
        ("role:read", "GET:/api/v1/roles", 1),
    ]
    assert records[0].code_label == "编辑用户"
    assert records[0].last_at == day2
    assert records[0].last_user_id == USER


async def test_list_respects_day_window(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(denials.timezone, "now", lambda: datetime(2026, 10, 10, 8, 0, 0))
    await denials.record_denial(redis, user_id=USER, code="a:read", route_key="GET:/a", role_versions={}, catalog_version=1)
    monkeypatch.setattr(denials.timezone, "now", lambda: datetime(2026, 10, 17, 8, 0, 0))
    assert await denials.list_recent_denials(redis, days=7, labels={}) == []


async def test_record_failure_never_raises():
    await denials.record_denial(
        BrokenRedis(), user_id=USER, code="a:read", route_key="GET:/a", role_versions={}, catalog_version=1
    )
