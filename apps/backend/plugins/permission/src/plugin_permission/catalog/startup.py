"""
启动时构建权限码目录：声明不合法或路由自检出现 error 时中止启动。

Author : Coke
Date   : 2026-10-17
"""

from fastapi import FastAPI
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.log import get_plugin_logger

from plugin_permission.catalog.registry import CatalogError, get_catalog
from plugin_permission.catalog.route_check import check_routes, collect_route_bindings
from plugin_permission.catalog.runtime import init_catalog_runtime, mark_catalog_version, rebuild_catalog
from plugin_permission.catalog.version import sync_catalog_version
from plugin_permission.dashboard.services import find_unknown_dashboard_codes

logger = get_plugin_logger("Permission")


async def build_catalog_on_startup(app: FastAPI) -> None:
    """插件 on_startup 回调：构建目录、执行路由自检并发布目录。"""
    catalog = init_catalog_runtime(getattr(app.state, "plugins", []), collect_route_bindings(app.routes))
    issues = check_routes(app.routes, catalog)
    for issue in issues:
        if issue.level == "warning":
            logger.warning(
                "Permission catalog warning: target={target} message={message}",
                target=issue.route_key,
                message=issue.message,
            )
    errors = [issue for issue in issues if issue.level == "error"]
    if errors:
        raise CatalogError("\n".join(f"{issue.route_key}: {issue.message}" for issue in errors))
    async with AsyncSessionLocal() as session:
        catalog = await rebuild_catalog(session)
    logger.info(
        "Permission catalog built: resources={resources} codes={codes} digest={digest}",
        resources=len(catalog.resources),
        codes=len(catalog.codes),
        digest=catalog.digest(),
    )


async def sync_catalog_version_on_startup(app: FastAPI) -> None:
    """插件 on_startup 回调。"""
    catalog = get_catalog()
    unknown = find_unknown_dashboard_codes(app.state.plugins, catalog)
    if unknown:
        raise CatalogError(f"Dashboard modules require undeclared permission codes: {', '.join(unknown)}")
    mark_catalog_version(await sync_catalog_version(RedisManager.client(), catalog.digest()))
