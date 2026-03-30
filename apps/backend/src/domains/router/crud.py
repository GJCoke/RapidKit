"""
router file.

Description.

Author : Coke
Date   : 2025-04-22
"""

from typing import Any

from sqlmodel import delete
from sqlmodel.ext.asyncio.session import AsyncSession

from src.common.crud import BaseSQLModelCRUD
from src.domains.router.models import InterfaceRouter
from src.domains.router.schemas import FastAPIRouterCreate, FastAPIRouterUpdate


class RouterCRUD(BaseSQLModelCRUD[InterfaceRouter, FastAPIRouterCreate, FastAPIRouterUpdate]):
    """基于 SQLAlchemy 的路由 CRUD 操作。"""

    async def clear_router(self, *, session: AsyncSession | None = None) -> None:
        """
        删除路由表中的所有记录。

        Args:
            session: 可选 SQLAlchemy 异步会话，未提供时使用默认会话。
        """
        session = session or self.session

        statement = delete(self.model)
        await session.exec(statement)  # type: ignore
        await self.commit()

    async def create_app_routers(
        self,
        routes: list[FastAPIRouterCreate] | list[dict[str, Any]],
        *,
        session: AsyncSession | None = None,
    ) -> None:
        """
        批量插入多条路由记录到数据库。

        Args:
            routes: 路由创建 schema 实例列表。
            session: 可选 SQLAlchemy 异步会话，未提供时使用默认会话。
        """
        session = session or self.session

        session.add_all([self.model.model_validate(route) for route in routes])
        await self.commit()
