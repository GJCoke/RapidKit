"""
部门服务提供者：供其他插件通过 ServiceRegistry 查询部门层级。

Author : Coke
Date   : 2026-10-17
"""

import json
from collections.abc import Callable, Iterable
from datetime import timedelta
from uuid import UUID

from rapidkit_core.cache import bump_version, get_or_rebuild, get_versions
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.redis_client import AsyncRedisClient
from sqlmodel import select

from plugin_department.models import Department

DEPT_TREE_VERSION_KEY = "dept:tree_version"
DEPT_TREE_TTL = timedelta(hours=4)


def dept_tree_key(version: int) -> str:
    """部门树缓存 key，版本进入 key，旧版本按 TTL 过期。"""
    return f"dept:tree:v{version}"


async def bump_dept_tree_version(redis: AsyncRedisClient) -> int:
    """部门新增 / 修改 / 删除提交后调用，使部门树缓存失效。"""
    return await bump_version(redis, DEPT_TREE_VERSION_KEY)


def collect_subtree_ids(pairs: Iterable[tuple[UUID, UUID | None]], root: UUID) -> list[UUID]:
    """
    从 (id, parent_id) 列表计算以 root 为根的子树。

    Args:
        pairs: 全部部门的 (id, parent_id)。
        root: 子树根部门 ID。

    Returns:
        根部门及全部下级部门 ID；root 不存在时为空列表。
    """
    pair_list = list(pairs)
    if root not in {dept_id for dept_id, _ in pair_list}:
        return []
    children: dict[UUID, list[UUID]] = {}
    for dept_id, parent_id in pair_list:
        if parent_id is not None:
            children.setdefault(parent_id, []).append(dept_id)

    result: list[UUID] = []
    visited: set[UUID] = set()
    queue = [root]
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        result.append(current)
        queue.extend(children.get(current, []))
    return result


class DepartmentResolverImpl:
    """DepartmentResolver 实现：部门 (id, parent_id) 列表按部门树版本缓存在 Redis。"""

    def __init__(self, redis_factory: Callable[[], AsyncRedisClient] = RedisManager.client) -> None:
        self._redis_factory = redis_factory

    async def _load_pairs(self) -> list[tuple[UUID, UUID | None]]:
        async with AsyncSessionLocal() as session:
            result = await session.exec(select(Department.id, Department.parent_id))
            return [(dept_id, parent_id) for dept_id, parent_id in result.all()]

    async def _load_pairs_json(self) -> str:
        pairs = await self._load_pairs()
        return json.dumps([[str(dept_id), str(parent_id) if parent_id else None] for dept_id, parent_id in pairs])

    async def _pairs(self) -> list[tuple[UUID, UUID | None]]:
        redis = self._redis_factory()
        [version] = await get_versions(redis, [DEPT_TREE_VERSION_KEY])
        raw = await get_or_rebuild(redis, dept_tree_key(version), self._load_pairs_json, ttl=DEPT_TREE_TTL)
        return [(UUID(dept_id), UUID(parent_id) if parent_id else None) for dept_id, parent_id in json.loads(raw)]

    async def get_by_id(self, dept_id: UUID) -> Department | None:
        async with AsyncSessionLocal() as session:
            return await session.get(Department, dept_id)

    async def get_children_ids(self, dept_id: UUID) -> list[UUID]:
        return [child for child, parent in await self._pairs() if parent == dept_id]

    async def get_ancestor_ids(self, dept_id: UUID) -> list[UUID]:
        parents = dict(await self._pairs())
        result: list[UUID] = []
        current = parents.get(dept_id)
        while current is not None and current not in result:
            result.append(current)
            current = parents.get(current)
        return result

    async def get_subtree_ids(self, dept_id: UUID) -> list[UUID]:
        return collect_subtree_ids(await self._pairs(), dept_id)
