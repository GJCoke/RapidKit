# apps/backend/plugins/permission/src/plugin_permission/role_versions.py
"""
角色版本号：角色效果的唯一版本源，变更时递增。

Author : Coke
Date   : 2026-10-19
"""

from rapidkit_core.cache import bump_version, get_versions
from rapidkit_core.redis_client import AsyncRedisClient


def role_version_key(role_code: str) -> str:
    """角色版本号 key。"""
    return f"auth:role_version:{role_code}"


async def get_role_versions(redis: AsyncRedisClient, role_codes: list[str]) -> dict[str, int]:
    """批量读取角色版本号；缺失时以时间戳初始化，不再视为 0。"""
    if not role_codes:
        return {}
    versions = await get_versions(redis, [role_version_key(code) for code in role_codes])
    return dict(zip(role_codes, versions))


async def incr_role_version(redis: AsyncRedisClient, role_code: str) -> int:
    """递增角色版本号。"""
    return await bump_version(redis, role_version_key(role_code))
