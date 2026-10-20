# apps/backend/plugins/permission/src/plugin_permission/catalog/version.py
"""
权限码目录版本：目录内容变化时递增，进入角色快照 key 与用户权限缓存。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_core.cache import bump_version, get_versions
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient

from plugin_permission.role_versions import role_version_key

logger = get_plugin_logger("Permission")

CATALOG_VERSION_KEY = "auth:permission_catalog_version"
CATALOG_DIGEST_KEY = "auth:permission_catalog_digest"


async def get_permission_versions(redis: AsyncRedisClient, role_codes: list[str]) -> tuple[dict[str, int], int]:
    """
    一次往返读取角色版本与目录版本；缺失时按时间戳初始化。

    Args:
        redis: AsyncRedisClient 实例。
        role_codes: 角色编码。

    Returns:
        (角色编码 -> 版本, 目录版本)。
    """
    keys = [role_version_key(code) for code in role_codes] + [CATALOG_VERSION_KEY]
    versions = await get_versions(redis, keys)
    return dict(zip(role_codes, versions[:-1])), versions[-1]


async def sync_catalog_version(redis: AsyncRedisClient, digest: str) -> int:
    """
    目录摘要与上次不同则记录新摘要并递增目录版本。

    多个进程同时启动时可能各递增一次，只会多一次缓存重建，不影响正确性。

    Args:
        redis: AsyncRedisClient 实例。
        digest: ``PermissionCatalog.digest()``。

    Returns:
        当前目录版本。
    """
    if await redis.get(CATALOG_DIGEST_KEY) == digest:
        [version] = await get_versions(redis, [CATALOG_VERSION_KEY])
        return version
    await redis.set(CATALOG_DIGEST_KEY, digest)
    version = await bump_version(redis, CATALOG_VERSION_KEY)
    logger.warning("Permission catalog changed: version={version} digest={digest}", version=version, digest=digest)
    return version


async def read_catalog_version(redis: AsyncRedisClient) -> int:
    """读取目录版本；缺失时按时间戳初始化。"""
    [version] = await get_versions(redis, [CATALOG_VERSION_KEY])
    return version
