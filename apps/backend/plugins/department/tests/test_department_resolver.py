"""部门子树计算测试。"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from plugin_department import providers
from plugin_department.providers import (
    DEPT_TREE_VERSION_KEY,
    DepartmentResolverImpl,
    bump_dept_tree_version,
    collect_subtree_ids,
    dept_tree_key,
)

def test_subtree_includes_root_and_all_descendants():
    root, child, grandchild, other = uuid4(), uuid4(), uuid4(), uuid4()
    pairs = [(root, None), (child, root), (grandchild, child), (other, None)]
    assert set(collect_subtree_ids(pairs, root)) == {root, child, grandchild}


def test_leaf_subtree_is_itself():
    root, leaf = uuid4(), uuid4()
    assert collect_subtree_ids([(root, None), (leaf, root)], leaf) == [leaf]


def test_unknown_root_returns_empty():
    assert collect_subtree_ids([(uuid4(), None)], uuid4()) == []


def test_cycle_does_not_loop_forever():
    a, b = uuid4(), uuid4()
    assert set(collect_subtree_ids([(a, b), (b, a)], a)) == {a, b}


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

    async def delete(self, key):
        self.data.pop(key, None)

    def lock(self, name, timeout=None, blocking=True):
        lock = MagicMock()
        lock.acquire = AsyncMock(return_value=True)
        lock.release = AsyncMock()
        return lock


async def test_subtree_is_cached_until_version_bumps(monkeypatch):
    root, child = uuid4(), uuid4()
    pairs = [[(root, None), (child, root)], [(root, None)]]
    loads = AsyncMock(side_effect=lambda: pairs.pop(0))
    redis = FakeRedis()
    resolver = DepartmentResolverImpl(redis_factory=lambda: redis)
    monkeypatch.setattr(resolver, "_load_pairs", loads)

    assert set(await resolver.get_subtree_ids(root)) == {root, child}
    assert set(await resolver.get_subtree_ids(root)) == {root, child}
    assert loads.await_count == 1

    await bump_dept_tree_version(redis)
    assert await resolver.get_subtree_ids(root) == [root]
    assert loads.await_count == 2
    version = int(redis.data[DEPT_TREE_VERSION_KEY])
    assert dept_tree_key(version) in redis.data
