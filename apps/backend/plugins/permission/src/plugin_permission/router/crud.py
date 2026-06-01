"""
Router CRUD.

Author : Coke
Date   : 2025-04-22
"""

from typing import Any

from rapidkit_common.crud import BaseCRUD
from sqlmodel import delete

from plugin_permission.models import InterfaceRouter
from plugin_permission.router.schemas import FastAPIRouterCreate


class RouterCRUD(BaseCRUD[InterfaceRouter]):
    """基于 SQLAlchemy 的路由 CRUD 操作。"""

    model = InterfaceRouter

    async def clear_router(self) -> None:
        statement = delete(self.model)
        await self.session.exec(statement)

    async def create_app_routers(
        self,
        routes: list[FastAPIRouterCreate] | list[dict[str, Any]],
    ) -> None:
        self.session.add_all([self.model.model_validate(route) for route in routes])
