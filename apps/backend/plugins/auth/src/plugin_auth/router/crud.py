"""
Router CRUD.

Author : Coke
Date   : 2025-04-22
"""

from typing import Any

from rapidkit_common.crud import BaseSQLModelCRUD
from sqlmodel import delete
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_auth.router.models import InterfaceRouter
from plugin_auth.router.schemas import FastAPIRouterCreate, FastAPIRouterUpdate


class RouterCRUD(BaseSQLModelCRUD[InterfaceRouter, FastAPIRouterCreate, FastAPIRouterUpdate]):
    """基于 SQLAlchemy 的路由 CRUD 操作。"""

    async def clear_router(self, *, session: AsyncSession | None = None) -> None:
        session = session or self.session
        statement = delete(self.model)
        await session.exec(statement)
        await self.commit()

    async def create_app_routers(
        self,
        routes: list[FastAPIRouterCreate] | list[dict[str, Any]],
        *,
        session: AsyncSession | None = None,
    ) -> None:
        session = session or self.session
        session.add_all([self.model.model_validate(route) for route in routes])
        await self.commit()
