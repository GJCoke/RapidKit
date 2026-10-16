"""
角色快照缓存：按角色版本缓存角色效果，失效只需递增版本，重建经单飞回源。

Author : Coke
Date   : 2026-10-15
"""

from functools import partial

from rapidkit_common.enums import Status
from rapidkit_core.cache import get_or_rebuild
from rapidkit_core.redis_client import AsyncRedisClient

from plugin_permission.cache import RoleSnapshot
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.crud import RoleCRUD


def role_snapshot_key(role_code: str, version: int) -> str:
    """角色快照 key，版本号进入 key，旧版本按 TTL 自然过期。"""
    return f"auth:role:{role_code}:v{version}"


async def _load_snapshot(role_crud: RoleCRUD, role_code: str) -> str:
    """从数据库加载单个角色快照；角色不存在时返回 ``active=False`` 的负缓存快照。"""
    roles = await role_crud.get_role_by_codes([role_code])
    if not roles:
        return RoleSnapshot(code=role_code).model_dump_json()
    role = roles[0]
    return RoleSnapshot(
        code=role.code,
        active=role.status == Status.ON,
        interface_permissions=role.interface_permissions or [],
        button_permissions=role.button_permissions or [],
        router_permissions=role.router_permissions or [],
        data_policy_ids=role.data_policy_ids or [],
        field_policy_ids=role.field_policy_ids or [],
    ).model_dump_json()


async def load_role_snapshots(
    redis: AsyncRedisClient,
    role_crud: RoleCRUD,
    versions: dict[str, int],
) -> list[RoleSnapshot]:
    """
    按当前版本读取角色快照。

    未命中的角色逐个单飞重建，不存在的角色写入负缓存。

    Args:
        redis: AsyncRedisClient 实例。
        role_crud: 角色 CRUD。
        versions: 角色编码到当前版本号的映射。

    Returns:
        与 ``versions`` 顺序一致的角色快照列表。
    """
    if not versions:
        return []
    codes = list(versions)
    keys = [role_snapshot_key(code, versions[code]) for code in codes]
    cached = await redis.mget(keys)

    snapshots: list[RoleSnapshot] = []
    for code, key, raw in zip(codes, keys, cached):
        if raw is None:
            raw = await get_or_rebuild(
                redis,
                key,
                partial(_load_snapshot, role_crud, code),
                ttl=rbac_config.PERMISSION_CACHE_TTL,
            )
        snapshots.append(RoleSnapshot.model_validate_json(raw))
    return snapshots
