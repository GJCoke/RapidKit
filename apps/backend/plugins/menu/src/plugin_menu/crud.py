"""
系统管理 CRUD 逻辑。

Author : Coke
Date   : 2025-05-18
"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from sqlalchemy import ColumnExpressionArgument
from sqlmodel import col, select

from plugin_menu.menu_responses import to_menu_list_response
from plugin_menu.models import Menu
from plugin_menu.schemas import MenuListResponse


class MenuCRUD(BaseCRUD[Menu]):
    """基于 SQLAlchemy 的菜单 CRUD 操作。"""

    model = Menu

    async def lock_menu_tree(self) -> None:
        """Serialize semantic menu-tree mutations for the current transaction."""
        statement = select(Menu.id).with_for_update()
        result = await self.session.exec(statement)
        result.all()

    async def get_by_route_name(self, route_name: str) -> Menu | None:
        """按路由名称获取菜单。"""
        statement = select(Menu).where(col(Menu.route_name) == route_name)
        result = await self.session.exec(statement)
        return result.one_or_none()

    async def get_parent_map(self) -> dict[UUID, UUID | None]:
        """获取完整的菜单父级关系。"""
        statement = select(Menu.id, Menu.parent_id)
        result = await self.session.exec(statement)
        return dict(result.all())

    async def get_constant_map(self) -> dict[UUID, bool]:
        """获取完整的菜单常量路由分区映射。"""
        statement = select(Menu.id, Menu.constant)
        result = await self.session.exec(statement)
        return dict(result.all())

    async def get_route_name_map(self) -> dict[UUID, str]:
        """获取菜单 ID 到路由名称的映射。"""
        statement = select(Menu.id, Menu.route_name)
        result = await self.session.exec(statement)
        return dict(result.all())

    async def get_active_menu_references(self, target_ids: set[UUID]) -> list[Menu]:
        """获取绑定了任一目标菜单的隐藏页面。"""
        if not target_ids:
            return []
        statement = select(Menu).where(col(Menu.active_menu_id).in_(target_ids))
        result = await self.session.exec(statement)
        return list(result.all())

    async def get_all_active_menu_bindings(self) -> list[Menu]:
        """获取所有已配置侧边栏高亮目标的菜单。"""
        statement = select(Menu).where(col(Menu.active_menu_id).is_not(None))
        result = await self.session.exec(statement)
        return list(result.all())

    async def get_menu_paginated_tree(
        self,
        *args: ColumnExpressionArgument[bool],
        page: int = 1,
        page_size: int = 10,
    ) -> PaginatedResponse[MenuListResponse]:
        """获取分页的菜单树（按根节点分页）"""

        root_pagination = await self.get_paginate(
            *args,
            page=page,
            size=page_size,
            order_by=col(self.model.order),
        )

        if not root_pagination.records:
            return PaginatedResponse[MenuListResponse](
                records=[], total=root_pagination.total, page=root_pagination.page, page_size=root_pagination.page_size
            )

        all_menus = await self.get_all(order_by=col(self.model.order))
        route_names = {menu.id: menu.route_name for menu in all_menus}
        menu_list = [to_menu_list_response(menu, route_names) for menu in all_menus]

        menu_map: dict[UUID, MenuListResponse] = {menu.id: menu for menu in menu_list}
        for menu in menu_list:
            if menu.parent_id:
                parent = menu_map.get(menu.parent_id)
                if parent:
                    if parent.children is None:
                        parent.children = []
                    if menu not in parent.children:
                        parent.children.append(menu)

        root_ids = [root.id for root in root_pagination.records]
        return PaginatedResponse[MenuListResponse](
            records=[menu_map[rid] for rid in root_ids if rid in menu_map],
            total=root_pagination.total,
            page=root_pagination.page,
            page_size=root_pagination.page_size,
        )

    async def get_menu_tree(self) -> list[MenuListResponse]:
        """获取整个菜单树"""

        statement = select(Menu).order_by(col(Menu.order))
        result = await self.session.exec(statement)
        response = result.all()

        route_names = {menu.id: menu.route_name for menu in response}
        menu_list = [to_menu_list_response(menu, route_names) for menu in response]

        menu_map = {menu.id: menu for menu in menu_list}
        tree = []

        for menu in menu_list:
            if menu.parent_id is None:
                tree.append(menu)
            else:
                parent = menu_map.get(menu.parent_id)
                if parent:
                    if parent.children is None:
                        parent.children = []
                    parent.children.append(menu)

        return tree
