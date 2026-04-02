"""
前端动态路由业务逻辑。

将 Menu 模型转换为前端 ElegantConstRoute 格式，
并根据用户角色权限进行过滤。

Author : Coke
Date   : 2026-04-02
"""

from __future__ import annotations

from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.domains.auth.models import User
from src.domains.menu.models import Menu
from src.domains.role.crud import RoleCRUD
from src.domains.route.schemas import MenuRouteResponse, RouteMeta, UserRouteResponse
from src.utils.enums import MenuIconType, Status


def menu_to_route(menu: Menu) -> MenuRouteResponse:
    """
    将 Menu 模型转换为前端路由响应格式。

    Args:
        menu: 菜单模型实例。

    Returns:
        MenuRouteResponse: 前端路由格式。
    """
    # 处理图标类型
    icon = None
    local_icon = None
    if menu.icon:
        if menu.icon_type == MenuIconType.LOCAL:
            local_icon = menu.icon
        else:
            icon = menu.icon

    # 处理 query 字段：从 Query(key, value) 对象列表转为 dict 列表
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
    """
    将菜单列表构建为路由树。

    Args:
        menus: 菜单模型列表（已按 order 排序）。

    Returns:
        路由树根节点列表。
    """
    route_map: dict[UUID, MenuRouteResponse] = {}
    tree: list[MenuRouteResponse] = []

    # 先转换所有菜单
    for menu in menus:
        route = menu_to_route(menu)
        route_map[menu.id] = route

    # 构建父子关系
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
    """
    获取常量路由（公共路由）。

    Args:
        session: 数据库会话。

    Returns:
        常量路由树。
    """
    statement = (
        select(Menu)
        .where(col(Menu.constant) == True, col(Menu.status) == Status.ON)  # noqa: E712
        .order_by(col(Menu.order))
    )
    result = await session.exec(statement)
    menus = list(result.all())
    return build_route_tree(menus)


async def get_user_routes(
    user: User,
    session: AsyncSession,
    role_crud: RoleCRUD,
) -> UserRouteResponse:
    """
    获取当前用户的授权路由。

    管理员获取所有非常量路由；普通用户根据角色的 router_permissions 过滤。

    Args:
        user: 当前用户。
        session: 数据库会话。
        role_crud: 角色 CRUD 实例。

    Returns:
        包含路由列表和首页路由名的响应。
    """
    # 查询所有非常量、启用的菜单
    statement = (
        select(Menu)
        .where(col(Menu.constant) == False, col(Menu.status) == Status.ON)  # noqa: E712
        .order_by(col(Menu.order))
    )
    result = await session.exec(statement)
    all_menus = list(result.all())

    if user.is_admin:
        # 管理员获取所有非常量路由
        filtered_menus = all_menus
    else:
        # 获取用户角色的路由权限
        roles = await role_crud.get_role_by_codes(user.roles or [])
        permitted_routes: set[str] = set()
        for role in roles:
            permitted_routes.update(role.router_permissions or [])

        # 过滤菜单：保留有权限的菜单及其父级目录
        permitted_menu_ids: set[UUID] = set()
        menu_map = {m.id: m for m in all_menus}

        for menu in all_menus:
            if menu.route_name in permitted_routes:
                # 标记此菜单及其所有父级
                permitted_menu_ids.add(menu.id)
                parent_id = menu.parent_id
                while parent_id and parent_id in menu_map:
                    permitted_menu_ids.add(parent_id)
                    parent_id = menu_map[parent_id].parent_id

        filtered_menus = [m for m in all_menus if m.id in permitted_menu_ids]

    routes = build_route_tree(filtered_menus)

    # 确定首页路由
    home = "home"
    if routes:
        # 取第一个叶子路由作为首页
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
