"""
前端动态路由业务逻辑。

将 Menu 模型转换为前端 ElegantConstRoute 格式，
并根据用户角色权限进行过滤。

Author : Coke
Date   : 2026-04-02
"""

from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from rapidkit_common.auth import UserProtocol

from rapidkit_common.enums import MenuIconType, MenuType, Status
from rapidkit_common.protocols.permission import PermissionCacheManager
from rapidkit_framework.services import get_service
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_menu.models import Menu
from plugin_menu.route_schemas import MenuRouteResponse, RouteMeta, UserRouteResponse


def menu_to_route(menu: Menu, route_names: dict[UUID, str]) -> MenuRouteResponse:
    """将 Menu 模型转换为前端路由响应格式。"""
    icon = None
    local_icon = None
    if menu.icon:
        if menu.icon_type == MenuIconType.LOCAL:
            local_icon = menu.icon
        else:
            icon = menu.icon

    query_list = None
    if menu.query:
        query_list = [{"key": q.key, "value": q.value} if hasattr(q, "key") else q for q in menu.query]

    meta = RouteMeta(
        title=menu.menu_name,
        i18n_key=menu.i18n_key,
        icon=icon,
        local_icon=local_icon,
        order=menu.order,
        constant=menu.constant,
        hide_in_menu=menu.hide_in_menu,
        active_menu=route_names.get(menu.active_menu_id) if menu.active_menu_id else None,
        keep_alive=menu.keep_alive,
        href=menu.href,
        multi_tab=menu.multi_tab,
        fixed_index_in_tab=menu.fixed_index_in_tab,
        query=query_list,
    )

    return MenuRouteResponse(
        id=str(menu.id),
        name=menu.route_name,
        path=menu.route_path,
        component=menu.component,
        meta=meta,
    )


def build_route_tree(menus: list[Menu]) -> list[MenuRouteResponse]:
    """将菜单列表构建为路由树。"""
    route_names = {menu.id: menu.route_name for menu in menus}
    route_map: dict[UUID, MenuRouteResponse] = {}
    tree: list[MenuRouteResponse] = []

    for menu in menus:
        route = menu_to_route(menu, route_names)
        route_map[menu.id] = route

    for menu in menus:
        route = route_map[menu.id]
        if menu.parent_id is None:
            tree.append(route)
        else:
            parent = route_map.get(menu.parent_id)
            if parent:
                if parent.children is None:
                    parent.children = []
                parent.children.append(route)

    return tree


async def get_constant_routes(session: AsyncSession) -> list[MenuRouteResponse]:
    """获取常量路由（公共路由）。"""
    statement = (
        select(Menu)
        .where(col(Menu.constant) == True, col(Menu.status) == Status.ON)  # noqa: E712
        .order_by(col(Menu.order))
    )
    result = await session.exec(statement)
    menus = list(result.all())
    return build_route_tree(menus)


def permitted_route_names(menus: list[Menu], codes: set[str]) -> set[str]:
    """Page menus whose permission code the user holds; directories follow their visible children."""
    return {
        menu.route_name
        for menu in menus
        if menu.menu_type == MenuType.MENU and menu.permission is not None and menu.permission in codes
    }


async def get_user_routes(
    user: "UserProtocol",
    session: AsyncSession,
) -> UserRouteResponse:
    """
    获取当前用户的授权路由。

    管理员获取所有非常量路由；普通用户根据角色的 router_permissions 过滤。
    """
    statement = (
        select(Menu)
        .where(col(Menu.constant) == False, col(Menu.status) == Status.ON)  # noqa: E712
        .order_by(col(Menu.order))
    )
    result = await session.exec(statement)
    all_menus = list(result.all())

    if user.is_admin:
        filtered_menus = all_menus
    else:
        cache_mgr = get_service(PermissionCacheManager)
        permitted_routes = permitted_route_names(all_menus, await cache_mgr.get_role_codes(user.roles or []))

        permitted_menu_ids: set[UUID] = set()
        menu_map = {m.id: m for m in all_menus}

        for menu in all_menus:
            if menu.route_name in permitted_routes:
                if menu.active_menu_id is not None:
                    active_target_found = False
                    page_ancestors_permitted = True
                    ancestor_id = menu.parent_id
                    visited: set[UUID] = set()
                    while ancestor_id is not None and ancestor_id not in visited:
                        visited.add(ancestor_id)
                        ancestor = menu_map.get(ancestor_id)
                        if ancestor is None:
                            page_ancestors_permitted = False
                            break
                        if ancestor.menu_type == MenuType.MENU and ancestor.route_name not in permitted_routes:
                            page_ancestors_permitted = False
                            break
                        if ancestor.id == menu.active_menu_id:
                            active_target_found = True
                        ancestor_id = ancestor.parent_id
                    if not active_target_found or not page_ancestors_permitted:
                        continue
                permitted_menu_ids.add(menu.id)
                parent_id = menu.parent_id
                while parent_id and parent_id in menu_map:
                    permitted_menu_ids.add(parent_id)
                    parent_id = menu_map[parent_id].parent_id

        filtered_menus = [m for m in all_menus if m.id in permitted_menu_ids]

    routes = build_route_tree(filtered_menus)

    home = "home"
    if routes:

        def find_first_leaf(route_list: list[MenuRouteResponse]) -> str | None:
            for r in route_list:
                if r.children:
                    leaf = find_first_leaf(r.children)
                    if leaf:
                        return leaf
                else:
                    return r.name
            return None

        first_leaf = find_first_leaf(routes)
        if first_leaf:
            home = first_leaf

    return UserRouteResponse(routes=routes, home=home)
