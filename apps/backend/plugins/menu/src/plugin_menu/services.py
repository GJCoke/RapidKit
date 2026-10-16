"""
菜单查询过滤与缓存服务。

Author : Coke
Date   : 2025-05-18
"""

import hashlib
import json
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import TypeAdapter
from rapidkit_common.enums import MenuType, Status
from rapidkit_core.cache import PluginCacheManager, bump_version, get_or_rebuild, get_versions
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.realtime import emit_permission_changed
from rapidkit_framework.exceptions import AppException
from sqlalchemy import ColumnElement
from sqlmodel import col, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_menu.crud import MenuCRUD
from plugin_menu.menu_responses import to_menu_response
from plugin_menu.models import Menu
from plugin_menu.route_schemas import MenuRouteResponse, UserRouteResponse
from plugin_menu.route_services import get_constant_routes, get_user_routes
from plugin_menu.schemas import ActiveMenuOption, MenuCreate, MenuListResponse, MenuResponse, MenuUpdate
from plugin_menu.status_codes import MenuStatusCode

if TYPE_CHECKING:
    from rapidkit_common.auth import UserProtocol

from rapidkit_core.redis_client import AsyncRedisClient

logger = get_plugin_logger("Menu")

_cache = PluginCacheManager("menu")
_VERSION_KEY = _cache.make_key("version")

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


def is_strict_ancestor(
    target_id: UUID,
    parent_id: UUID | None,
    parent_map: dict[UUID, UUID | None],
) -> bool:
    """Return whether *target_id* is on the strict ancestor chain of *parent_id*."""
    visited: set[UUID] = set()
    current = parent_id
    while current is not None and current not in visited:
        if current == target_id:
            return True
        visited.add(current)
        current = parent_map.get(current)
    return False


def is_same_constant_segment(
    target_id: UUID,
    parent_id: UUID | None,
    parent_map: dict[UUID, UUID | None],
    constant_map: dict[UUID, bool],
    constant: bool,
) -> bool:
    """Return whether every node from the source parent through the target shares a partition."""
    visited: set[UUID] = set()
    current = parent_id
    while current is not None and current not in visited:
        if constant_map.get(current) != constant:
            return False
        if current == target_id:
            return True
        visited.add(current)
        current = parent_map.get(current)
    return False


async def resolve_active_menu_id(
    crud: MenuCRUD,
    active_menu: str | None,
    menu_id: UUID | None,
    parent_id: UUID | None,
    menu_type: MenuType,
    hide_in_menu: bool,
    constant: bool,
) -> UUID | None:
    """Resolve and validate a public active-menu route name to its stable menu ID."""
    if active_menu is None:
        return None
    if menu_type != MenuType.MENU or not hide_in_menu or parent_id is None:
        raise AppException(MenuStatusCode.ACTIVE_MENU_INVALID_SOURCE)

    target = await crud.get_by_route_name(active_menu)
    if target is None:
        raise AppException(MenuStatusCode.ACTIVE_MENU_TARGET_NOT_FOUND)
    if target.id == menu_id:
        raise AppException(MenuStatusCode.ACTIVE_MENU_NOT_ANCESTOR)
    if (
        target.menu_type != MenuType.MENU
        or target.hide_in_menu
        or target.status != Status.ON
        or target.constant != constant
    ):
        raise AppException(MenuStatusCode.ACTIVE_MENU_TARGET_UNAVAILABLE)

    parent_map = await crud.get_parent_map()
    if not is_strict_ancestor(target.id, parent_id, parent_map):
        raise AppException(MenuStatusCode.ACTIVE_MENU_NOT_ANCESTOR)
    constant_map = await crud.get_constant_map()
    if not is_same_constant_segment(target.id, parent_id, parent_map, constant_map, constant):
        raise AppException(MenuStatusCode.ACTIVE_MENU_TARGET_UNAVAILABLE)
    return target.id


async def ensure_update_preserves_active_menu_bindings(
    crud: MenuCRUD,
    current: Menu,
    *,
    parent_id: UUID | None,
    menu_type: MenuType,
    status: Status,
    hide_in_menu: bool,
    active_menu_id: UUID | None,
    constant: bool | None = None,
) -> None:
    """Reject a target mutation or move that would invalidate existing bindings."""
    references = await crud.get_active_menu_references({current.id})
    proposed_constant = current.constant if constant is None else constant
    if references and (
        menu_type != MenuType.MENU or status != Status.ON or hide_in_menu or proposed_constant != current.constant
    ):
        raise AppException(MenuStatusCode.REFERENCED_TARGET_CONFLICT)

    parent_changed = parent_id != current.parent_id
    constant_changed = proposed_constant != current.constant
    if not parent_changed and not constant_changed:
        return

    parent_map = await crud.get_parent_map()
    parent_map[current.id] = parent_id
    constant_map = await crud.get_constant_map()
    constant_map[current.id] = proposed_constant
    bindings = await crud.get_all_active_menu_bindings()
    for binding in bindings:
        binding_active_menu_id = active_menu_id if binding.id == current.id else binding.active_menu_id
        if binding_active_menu_id is None:
            continue
        binding_parent_id = parent_id if binding.id == current.id else binding.parent_id
        if not is_strict_ancestor(binding_active_menu_id, binding_parent_id, parent_map):
            raise AppException(MenuStatusCode.MOVE_INVALIDATES_BINDING)
        binding_constant = proposed_constant if binding.id == current.id else constant_map.get(binding.id)
        if binding_constant is None or not is_same_constant_segment(
            binding_active_menu_id,
            binding_parent_id,
            parent_map,
            constant_map,
            binding_constant,
        ):
            raise AppException(MenuStatusCode.REFERENCED_TARGET_CONFLICT)


async def ensure_delete_preserves_active_menu_bindings(crud: MenuCRUD, ids: list[UUID]) -> None:
    """Reject deletion when a surviving binding would lose strict ancestry."""
    removed_ids = set(ids)
    references = await crud.get_active_menu_references(removed_ids)
    if any(reference.id not in removed_ids for reference in references):
        raise AppException(MenuStatusCode.REFERENCED_TARGET_CONFLICT)

    parent_map = await crud.get_parent_map()
    for removed_id in removed_ids:
        parent_map.pop(removed_id, None)

    bindings = await crud.get_all_active_menu_bindings()
    for binding in bindings:
        if binding.id in removed_ids or binding.active_menu_id is None:
            continue
        if binding.active_menu_id in removed_ids or not is_strict_ancestor(
            binding.active_menu_id,
            binding.parent_id,
            parent_map,
        ):
            raise AppException(MenuStatusCode.REFERENCED_TARGET_CONFLICT)


async def ensure_active_menu_constant_partition(
    crud: MenuCRUD,
    active_menu_id: UUID | None,
    constant: bool,
) -> None:
    """Ensure an existing ID binding stays within its route partition."""
    if active_menu_id is None:
        return
    target = await crud.get(active_menu_id)
    if target is None:
        raise AppException(MenuStatusCode.ACTIVE_MENU_TARGET_NOT_FOUND)
    if target.constant != constant:
        raise AppException(MenuStatusCode.ACTIVE_MENU_TARGET_UNAVAILABLE)


async def create_menu(crud: MenuCRUD, data: MenuCreate) -> MenuResponse:
    """Create a menu and resolve its optional public active-menu route name."""
    await crud.lock_menu_tree()
    values = data.model_dump(exclude={"active_menu"})
    if data.menu_type != MenuType.MENU or not data.hide_in_menu:
        values["active_menu_id"] = None
    else:
        values["active_menu_id"] = await resolve_active_menu_id(
            crud,
            data.active_menu,
            None,
            data.parent_id,
            data.menu_type,
            data.hide_in_menu,
            data.constant,
        )
    menu = await crud.create(values)
    return to_menu_response(menu, await crud.get_route_name_map())


async def update_menu(crud: MenuCRUD, menu_id: UUID, data: MenuUpdate) -> MenuResponse:
    """Update a menu while preserving all existing active-menu references."""
    await crud.lock_menu_tree()
    current = await crud.get(menu_id, nullable=False)
    values = data.model_dump(exclude_unset=True, exclude={"active_menu"})
    parent_id = values.get("parent_id", current.parent_id)
    menu_type = values.get("menu_type", current.menu_type)
    status = values.get("status", current.status)
    hide_in_menu = values.get("hide_in_menu", current.hide_in_menu)
    constant = values.get("constant", current.constant)

    if menu_type != MenuType.MENU or not hide_in_menu:
        values["active_menu_id"] = None
    elif "active_menu" in data.model_fields_set:
        values["active_menu_id"] = await resolve_active_menu_id(
            crud,
            data.active_menu,
            menu_id,
            parent_id,
            menu_type,
            hide_in_menu,
            constant,
        )
    else:
        values["active_menu_id"] = current.active_menu_id
        await ensure_active_menu_constant_partition(crud, current.active_menu_id, constant)

    await ensure_update_preserves_active_menu_bindings(
        crud,
        current,
        parent_id=parent_id,
        menu_type=menu_type,
        status=status,
        hide_in_menu=hide_in_menu,
        active_menu_id=values["active_menu_id"],
        constant=constant,
    )

    menu = await crud.update_by_id(menu_id, values)
    return to_menu_response(menu, await crud.get_route_name_map())


async def delete_menu(crud: MenuCRUD, menu_id: UUID) -> None:
    """Delete one unreferenced menu."""
    await crud.lock_menu_tree()
    await ensure_delete_preserves_active_menu_bindings(crud, [menu_id])
    await crud.delete(menu_id)


async def delete_menus(crud: MenuCRUD, ids: list[UUID]) -> None:
    """Delete a batch of unreferenced menus atomically."""
    await crud.lock_menu_tree()
    await ensure_delete_preserves_active_menu_bindings(crud, ids)
    await crud.delete_all(ids)


async def get_active_menu_options(
    crud: MenuCRUD,
    parent_id: UUID | None,
    constant: bool,
) -> list[ActiveMenuOption]:
    """Return eligible page-menu ancestors from nearest to farthest."""
    if parent_id is None:
        return []

    menus = await crud.get_all()
    menu_map = {menu.id: menu for menu in menus}
    options: list[ActiveMenuOption] = []
    visited: set[UUID] = set()
    current_id = parent_id
    while current_id is not None and current_id not in visited:
        visited.add(current_id)
        current = menu_map.get(current_id)
        if current is None:
            break
        if current.constant != constant:
            break
        if current.menu_type == MenuType.MENU and current.status == Status.ON and not current.hide_in_menu:
            options.append(
                ActiveMenuOption(
                    id=current.id,
                    route_name=current.route_name,
                    menu_name=current.menu_name,
                )
            )
        current_id = current.parent_id
    return options


async def _versioned_key(redis: AsyncRedisClient, *parts: str) -> str:
    """生成带菜单版本号的缓存 key，版本变更后旧 key 按 TTL 自然过期。"""
    [version] = await get_versions(redis, [_VERSION_KEY])
    return _cache.make_key(f"v{version}", *parts)


async def get_cached_menu_tree(
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> list[MenuListResponse]:
    """获取完整菜单树（版本化缓存 + 单飞重建）。"""

    async def load() -> str:
        tree = await MenuCRUD(session).get_menu_tree()
        return _menu_tree_adapter.dump_json(tree).decode()

    key = await _versioned_key(redis, "tree")
    return _menu_tree_adapter.validate_json(await get_or_rebuild(redis, key, load, ttl=_CACHE_TTL))


async def get_cached_pages(
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> list[str]:
    """获取所有页面组件名称（版本化缓存 + 单飞重建）。"""

    async def load() -> str:
        pages = await MenuCRUD(session).get_all(col(Menu.menu_type) == MenuType.MENU)
        return json.dumps([item.route_name for item in pages])

    key = await _versioned_key(redis, "pages")
    return json.loads(await get_or_rebuild(redis, key, load, ttl=_CACHE_TTL))


async def get_cached_constant_routes(
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> list[MenuRouteResponse]:
    """获取常量路由（版本化缓存 + 单飞重建）。"""

    async def load() -> str:
        return _route_list_adapter.dump_json(await get_constant_routes(session)).decode()

    key = await _versioned_key(redis, "route", "constant")
    return _route_list_adapter.validate_json(await get_or_rebuild(redis, key, load, ttl=_CACHE_TTL))


async def get_cached_user_routes(
    user: "UserProtocol",
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> UserRouteResponse:
    """获取用户授权路由（按角色组合版本化缓存 + 单飞重建）。"""
    roles_payload = json.dumps(sorted(user.roles or []), separators=(",", ":"))
    roles_key = hashlib.md5(roles_payload.encode()).hexdigest()
    identity_scope = "admin" if user.is_admin else "non-admin"

    async def load() -> str:
        return (await get_user_routes(user, session)).model_dump_json()

    key = await _versioned_key(redis, "route", "user", identity_scope, roles_key)
    return UserRouteResponse.model_validate_json(await get_or_rebuild(redis, key, load, ttl=_CACHE_TTL))


async def invalidate_menu_cache(redis: AsyncRedisClient) -> None:
    """递增菜单缓存版本（O(1)），不再 SCAN + DEL。"""
    version = await bump_version(redis, _VERSION_KEY)
    logger.debug("Menu cache version bumped to {version}", version=version)


async def publish_menu_change(redis: AsyncRedisClient) -> None:
    """事务提交后递增菜单版本并推送 menu 范围的权限变更信号。"""
    await invalidate_menu_cache(redis)
    await emit_permission_changed("menu")
