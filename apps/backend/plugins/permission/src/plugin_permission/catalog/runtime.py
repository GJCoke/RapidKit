"""
权限码目录运行时：持有基线输入、按数据库扩展重建生效目录，并按目录版本做跨进程刷新。

Author : Coke
Date   : 2026-10-17
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.plugin import PluginManifest
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.catalog import version as catalog_version
from plugin_permission.catalog.extensions import CatalogExtension
from plugin_permission.catalog.registry import PermissionCatalog, build_catalog, set_catalog
from plugin_permission.catalog.version import CATALOG_VERSION_KEY, read_catalog_version
from plugin_permission.extension.crud import PermissionExtensionCRUD

logger = get_plugin_logger("Permission")

__all__ = ["CATALOG_VERSION_KEY", "read_catalog_version"]

CHECK_INTERVAL_SECONDS = 1.0


@dataclass
class _RuntimeState:
    manifests: list[PluginManifest] = field(default_factory=list)
    route_bindings: dict[str, str] = field(default_factory=dict)
    baseline: PermissionCatalog | None = None
    version: int | None = None
    checked_at: float = float("-inf")


_state = _RuntimeState()
_rebuild_lock = asyncio.Lock()


def init_catalog_runtime(manifests: list[PluginManifest], route_bindings: dict[str, str]) -> PermissionCatalog:
    """保存基线输入并构建基线目录；基线校验失败抛 CatalogError（启动失败）。"""
    _state.manifests = list(manifests)
    _state.route_bindings = dict(route_bindings)
    _state.baseline = build_catalog(_state.manifests, _state.route_bindings)
    _state.version = None
    _state.checked_at = float("-inf")
    return _state.baseline


def get_baseline_catalog() -> PermissionCatalog:
    """不含扩展的基线目录，用于保存时判定。"""
    if _state.baseline is None:
        raise RuntimeError("Catalog runtime has not been initialized.")
    return _state.baseline


def get_route_bindings() -> dict[str, str]:
    """Require 声明的 route_key → 声明码。"""
    return dict(_state.route_bindings)


def to_catalog_extension(row: Any) -> CatalogExtension:
    """数据库行（或同形对象）→ CatalogExtension。"""
    return CatalogExtension(
        id=row.id,
        kind=row.kind,
        code=row.code,
        route_key=row.route_key,
        depends_on=row.depends_on,
        resource=row.resource,
        label=row.label,
        abac_action=row.abac_action,
    )


async def load_extension_rows(session: AsyncSession) -> list[Any]:
    """按创建时间升序加载扩展。"""
    return await PermissionExtensionCRUD(session).list_ordered()


async def rebuild_catalog(session: AsyncSession) -> PermissionCatalog:
    """从数据库加载扩展、重建并替换生效目录；失效扩展只记录 WARNING。"""
    rows = await load_extension_rows(session)
    catalog = build_catalog(_state.manifests, _state.route_bindings, [to_catalog_extension(row) for row in rows])
    for state in catalog.extension_states:
        if state.status == "invalid":
            logger.warning(
                "Permission extension invalid: id={id} kind={kind} code={code} reason={reason}",
                id=state.extension.id,
                kind=state.extension.kind,
                code=state.extension.code,
                reason=state.reason,
            )
    set_catalog(catalog)
    return catalog


async def bump_catalog_version(redis: AsyncRedisClient) -> int:
    """递增目录版本（P2 `catalog/version.py`）并记为本进程已同步版本。"""
    version = await catalog_version.bump_catalog_version(redis)
    mark_catalog_version(version)
    return version


def mark_catalog_version(version: int) -> None:
    """记录本进程目录对应的版本。"""
    _state.version = version


def local_catalog_version() -> int | None:
    """本进程目录对应的版本。"""
    return _state.version


async def ensure_catalog_fresh(
    redis: AsyncRedisClient,
    session: AsyncSession,
    *,
    version: int | None = None,
) -> None:
    """按版本刷新目录；已读取版本的缓存调用方不受轮询节流限制，也不重复读取 Redis。"""
    if version is None:
        now = time.monotonic()
        if now - _state.checked_at < CHECK_INTERVAL_SECONDS:
            return
        _state.checked_at = now
        version = await read_catalog_version(redis)
    if _state.version is not None and version <= _state.version:
        return
    async with _rebuild_lock:
        if _state.version is not None and version <= _state.version:
            return
        await rebuild_catalog(session)
        mark_catalog_version(version)
        logger.info("Permission catalog refreshed: version={version}", version=version)
