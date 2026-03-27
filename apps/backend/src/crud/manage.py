"""
系统管理 CRUD 逻辑。

该模块定义了 MenuCRUD 类，负责使用 SQLModel 和异步 SQLAlchemy 会话对 `Menu` 模型进行 CRUD 操作。

Author : Coke
Date   : 2025-05-18
"""

from sqlalchemy import ColumnExpressionArgument
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.crud.crud_sqlmodel import BaseSQLModelCRUD
from src.models.manage import Menu
from src.schemas.manage import MenuCreate, MenuListResponse, MenuUpdate
from src.schemas.response import PaginatedResponse


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

        # 2. 调用基类 get_paginate 获取一级菜单分页结果
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

        # 在内存中构建完整的树映射
        menu_map = {menu.id: menu for menu in all_menus}
        for menu in all_menus:
            if menu.parent_id:
                parent = menu_map.get(menu.parent_id)
                if parent:
                    if parent.children is None:
                        parent.children = []
                    # 避免重复挂载
                    if menu not in parent.children:
                        parent.children.append(menu)

        root_ids = [m.id for m in root_pagination.records]
        root_pagination.records = [menu_map[rid] for rid in root_ids if rid in menu_map]

        return root_pagination

    async def get_menu_tree(self, *, session: AsyncSession) -> list[MenuListResponse]:
        """获取整个菜单树"""
        session = session or self.session

        # 1. 查询所有菜单并按 order 排序
        statement = select(Menu).order_by(col(Menu.order))
        result = await session.exec(statement)
        response = result.all()

        # 2. 转换为 Pydantic 模型列表
        menu_list = [MenuListResponse.model_validate(m) for m in response]

        # 3. 构建 ID 到 菜单对象的映射
        menu_map = {menu.id: menu for menu in menu_list}
        tree = []

        # 4. 递归组装
        for menu in menu_list:
            if menu.parent_id is None:
                # 根节点
                tree.append(menu)
            else:
                # 找到父节点并将当前节点加入父节点的 children
                parent = menu_map.get(menu.parent_id)
                if parent:
                    if parent.children is None:
                        parent.children = []
                    parent.children.append(menu)

        return tree
