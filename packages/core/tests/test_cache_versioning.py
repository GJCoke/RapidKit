"""版本号与单飞重建测试。"""

import asyncio

import pytest
from rapidkit_core.cache import bump_version, get_or_rebuild, get_versions

SEED_FLOOR = 1_700_000_000_000


class FakeLock:
    def __init__(self, held: set[str], name: str) -> None:
        self._held = held
        self.name = name

    async def acquire(self) -> bool:
        if self.name in self._held:
            return False
        self._held.add(self.name)
        return True

    async def release(self) -> None:
        self._held.discard(self.name)


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.locks: set[str] = set()

    async def get(self, key: str) -> str | None:
        return self.data.get(key)

    async def set(self, key: str, value, *, ex=None, nx: bool = False) -> bool | None:
        if nx and key in self.data:
            return None
        self.data[key] = str(value)
        return True

    async def mget(self, keys: list[str]) -> list[str | None]:
        return [self.data.get(k) for k in keys]

    async def incr(self, key: str) -> int:
        self.data[key] = str(int(self.data.get(key, "0")) + 1)
        return int(self.data[key])

    def lock(self, name: str, timeout=None, blocking: bool = True) -> FakeLock:
        return FakeLock(self.locks, name)


class TestVersions:
    @pytest.mark.asyncio
    async def test_missing_version_is_seeded_with_timestamp(self):
        redis = FakeRedis()
        redis.data["a"] = "5"

        versions = await get_versions(redis, ["a", "b"])

        assert versions[0] == 5
        assert versions[1] >= SEED_FLOOR
        assert redis.data["b"] == str(versions[1])
        assert await get_versions(redis, ["a", "b"]) == versions

    @pytest.mark.asyncio
    async def test_empty_keys(self):
        assert await get_versions(FakeRedis(), []) == []

    @pytest.mark.asyncio
    async def test_bump_seeds_then_increments(self):
        redis = FakeRedis()

        first = await bump_version(redis, "v")
        second = await bump_version(redis, "v")

        assert first >= SEED_FLOOR
        assert second == first + 1


class TestGetOrRebuild:
    @pytest.mark.asyncio
    async def test_hit_skips_loader(self):
        redis = FakeRedis()
        redis.data["k"] = "cached"

        async def loader() -> str:
            raise AssertionError("loader must not run")

        assert await get_or_rebuild(redis, "k", loader, ttl=60) == "cached"

    @pytest.mark.asyncio
    async def test_concurrent_misses_load_once(self):
        redis = FakeRedis()
        calls = 0

        async def loader() -> str:
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.2)
            return "fresh"

        results = await asyncio.gather(*(get_or_rebuild(redis, "k", loader, ttl=60) for _ in range(10)))

        assert results == ["fresh"] * 10
        assert calls == 1
        assert redis.data["k"] == "fresh"
        assert "k:lock" not in redis.locks

    @pytest.mark.asyncio
    async def test_wait_timeout_falls_back_without_writing(self):
        redis = FakeRedis()
        redis.locks.add("k:lock")

        async def loader() -> str:
            return "direct"

        assert await get_or_rebuild(redis, "k", loader, ttl=60, wait_ms=150) == "direct"
        assert "k" not in redis.data

    @pytest.mark.asyncio
    async def test_loader_error_releases_lock(self):
        redis = FakeRedis()

        async def loader() -> str:
            raise RuntimeError("db down")

        with pytest.raises(RuntimeError):
            await get_or_rebuild(redis, "k", loader, ttl=60)
        assert "k:lock" not in redis.locks
