"""
FastAPI lifecycle.

Author : Coke
Date   : 2025-03-17
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from uuid import UUID

from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.routing import BaseRoute as StarletteRoute

from src.core.config import settings
from src.core.database import AsyncSessionLocal, RedisManager
from src.core.log import logger
from src.crud.router import RouterCRUD
from src.locales.watch import watch_locale_files
from src.models.router import InterfaceRouter
from src.schemas.router import FastAPIRouterCreate


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    FastAPI 生命周期管理。

    Args:
        app: FastAPI 应用实例。
    """

    watch_task = None
    if settings.ENVIRONMENT.is_dev:
        watch_task = asyncio.create_task(watch_locale_files())

    RedisManager.connect()
    RedisManager.connect(redis_url=str(settings.CELERY_REDIS_URL), pool_name="celery")

    logger.info("Application startup complete.")

    await store_router_in_db(app.routes)

    yield

    watch_task and watch_task.cancel()

    await RedisManager.clear()

    logger.info("Application shutdown complete.")


async def store_router_in_db(routes: list[StarletteRoute | APIRoute]) -> None:
    """
    过滤和校验后将路由信息存储到数据库。

    该函数处理路由对象列表，校验并存储到数据库，仅包含 APIRoute 类型且需要包含在 schema 中的路由。

    Args:
        routes: 路由对象列表（StarletteRoute 或 APIRoute
    """

    # if not settings.ENVIRONMENT.is_deployed:
    #     return

    app_routes: list[FastAPIRouterCreate] = []

    for route in routes:
        if not isinstance(route, APIRoute):
            continue

        if not route.include_in_schema:
            continue

        app_routes.append(
            FastAPIRouterCreate.model_validate(
                dict(
                    methods=route.methods,
                    path=route.path,
                    name=route.summary or route.name,
                    description=route.description,
                )
            )
        )

    async with AsyncSessionLocal() as session:
        router_db = RouterCRUD(InterfaceRouter, session=session)
        db_routes = await router_db.get_all()

        add_routes, remove_routes, update_routes = diff_api_routes(db_routes, app_routes)

        if add_routes:
            await router_db.create_all(add_routes)

        if remove_routes:
            await router_db.delete_all(remove_routes)

        if update_routes:
            await router_db.update_all(update_routes)


def diff_api_routes(
    db_routes: list[InterfaceRouter],
    app_routes: list[FastAPIRouterCreate],
) -> tuple[list[FastAPIRouterCreate], list[UUID], list[dict[str, Any]]]:
    """
    对比数据库和应用中的 API 路由，返回新增、删除和修改的路由列表。

    Args:
        db_routes: 数据库中存储的路由列表。
        app_routes: 当前应用中的路由列表。

    Returns:
        tuple: 包含三个元素的元组：
            - added_routes: 应用中有但数据库中没有的路由。
            - removed_routes: 数据库中有但应用中没有的路由 ID。
            - modified_routes: 数据库和应用中都存在但有差异的路由（包含变更字段及路由 ID）。
    """
    old_router = {item.path: item for item in db_routes}
    new_router = {item.path: item for item in app_routes}

    added_routes = []
    removed_routes = []
    modified_routes = []

    # Find the added routes
    for path in new_router:
        if path not in old_router:
            added_routes.append(new_router[path])

    # Find the removed routes
    for path in old_router:
        if path not in new_router:
            removed_routes.append(old_router[path].id)

    # Find the modified routes
    for path in old_router:
        if path in new_router:
            old_route = old_router[path]
            new_route = new_router[path]

            changed_info: dict[str, Any] = {}

            if old_route.methods != new_route.methods:
                changed_info["methods"] = new_route.methods

            if old_route.description != new_route.description:
                changed_info["description"] = new_route.description

            if old_route.name != new_route.name:
                changed_info["name"] = new_route.name

            if changed_info:
                modified_routes.append({**changed_info, "id": old_route.id})

    return added_routes, removed_routes, modified_routes
