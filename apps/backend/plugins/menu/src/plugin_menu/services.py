"""
菜单查询过滤与缓存服务。

Author : Coke
Date   : 2025-05-18
"""

import hashlib
import json
from typing import TYPE_CHECKING

from pydantic import TypeAdapter
from rapidkit_common.enums import MenuType, Status
from rapidkit_core.cache import PluginCacheManager
from rapidkit_core.log import get_plugin_logger
from sqlalchemy import ColumnElement
from sqlmodel import col, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_menu.crud import MenuCRUD
from plugin_menu.models import Menu
from plugin_menu.route_schemas import MenuRouteResponse, UserRouteResponse
from plugin_menu.route_services import get_constant_routes, get_user_routes
from plugin_menu.schemas import MenuListResponse

if TYPE_CHECKING:
    from rapidkit_common.auth import UserProtocol

from rapidkit_core.redis_client import AsyncRedisClient

logger = get_plugin_logger("Menu")

_cache = PluginCacheManager("menu")

_CACHE_TTL = 3600  # 1 小时

# TypeAdapter 用于 list 类型的序列化/反序列化
_menu_tree_adapter = TypeAdapter(list[MenuListResponse])
_route_list_adapter = TypeAdapter(list[MenuRouteResponse])


def filter_menu(status: "Status | None", keyword: str) -> list[ColumnElement[bool]]:
    """生成用于查询菜单的 SQLAlchemy 过滤条件。"""
    filters: list[ColumnElement[bool]] = [col(Menu.parent_id).is_(None)]

    if status is not None:
        filters.append(col(Menu.status) == status)

    if keyword:
        escaped = keyword.replace("%", r"\%").replace("_", r"\_")
        filters.append(
            or_(
                col(Menu.menu_name).like(f"%{escaped}%"),
                col(Menu.route_path).like(f"%{escaped}%"),
            )
        )

    return filters


async def get_cached_menu_tree(
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> list[MenuListResponse]:
    """获取完整菜单树（cache-aside）。"""
    key = _cache.make_key("tree")
    cached = await redis.get(key)
    if cached:
        return _menu_tree_adapter.validate_json(cached)

    crud = MenuCRUD(session)
    tree = await crud.get_menu_tree()

    await redis.set(key, _menu_tree_adapter.dump_json(tree).decode(), ex=_CACHE_TTL)
    return tree


async def get_cached_pages(
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> list[str]:
    """获取所有页面组件名称（cache-aside）。"""
    key = _cache.make_key("pages")
    cached = await redis.get(key)
    if cached:
        return json.loads(cached)

    crud = MenuCRUD(session)
    pages = await crud.get_all(col(Menu.menu_type) == MenuType.MENU)
    result = [item.route_name for item in pages]

    await redis.set(key, json.dumps(result), ex=_CACHE_TTL)
    return result


async def get_cached_constant_routes(
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> list[MenuRouteResponse]:
    """获取常量路由（cache-aside）。"""
    key = _cache.make_key("route", "constant")
    cached = await redis.get(key)
    if cached:
        return _route_list_adapter.validate_json(cached)

    routes = await get_constant_routes(session)

    await redis.set(key, _route_list_adapter.dump_json(routes).decode(), ex=_CACHE_TTL)
    return routes


async def get_cached_user_routes(
    user: "UserProtocol",
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> UserRouteResponse:
    """获取用户授权路由（按角色组合 cache-aside）。"""
    roles_key = hashlib.md5(":".join(sorted(user.roles or [])).encode()).hexdigest()
    key = _cache.make_key("route", "user", roles_key)
    cached = await redis.get(key)
    if cached:
        return UserRouteResponse.model_validate_json(cached)

    result = await get_user_routes(user, session)

    await redis.set(key, result.model_dump_json(), ex=_CACHE_TTL)
    return result


async def invalidate_menu_cache(redis: AsyncRedisClient) -> None:
    """清除所有菜单缓存。"""
    deleted = await _cache.invalidate_all(redis)
    if deleted:
        logger.debug("Invalidated {count} cache keys", count=deleted)
