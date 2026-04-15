"""
系统管理 CRUD 逻辑。

Author : Coke
Date   : 2025-05-18
"""

from sqlalchemy import ColumnExpressionArgument
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_common.crud import BaseSQLModelCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from plugin_menu.models import Menu
from plugin_menu.schemas import MenuCreate, MenuListResponse, MenuUpdate


class MenuCRUD(BaseSQLModelCRUD[Menu, MenuCreate, MenuUpdate]):
    """基于 SQLAlchemy 的菜单 CRUD 操作。"""

    async def get_menu_paginated_tree(
        self,
        *args: ColumnExpressionArgument[bool],
        page: int = 1,
        page_size: int = 10,
        session: AsyncSession | None = None,
    ) -> PaginatedResponse[MenuListResponse]:
        """获取分页的菜单树（按根节点分页）"""
        session = session or self.session

        root_pagination = await self.get_paginate(
            *args,
            page=page,
            size=page_size,
            order_by=col(self.model.order),
            serializer=MenuListResponse,
            session=session,
        )

        if not root_pagination.records:
            return root_pagination

        all_menus = await self.get_all(
            order_by=col(self.model.order),
            session=session,
            serializer=MenuListResponse,
        )

        menu_map = {menu.id: menu for menu in all_menus}
        for menu in all_menus:
            if menu.parent_id:
                parent = menu_map.get(menu.parent_id)
                if parent:
                    if parent.children is None:
                        parent.children = []
                    if menu not in parent.children:
                        parent.children.append(menu)

        root_ids = [m.id for m in root_pagination.records]
        root_pagination.records = [menu_map[rid] for rid in root_ids if rid in menu_map]

        return root_pagination

    async def get_menu_tree(self, *, session: AsyncSession) -> list[MenuListResponse]:
        """获取整个菜单树"""
        session = session or self.session

        statement = select(Menu).order_by(col(Menu.order))
        result = await session.exec(statement)
        response = result.all()

        menu_list = [MenuListResponse.model_validate(m) for m in response]

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
