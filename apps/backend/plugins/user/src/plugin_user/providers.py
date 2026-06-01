"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from typing import cast
from uuid import UUID

from rapidkit_common.protocols.user import UserProtocol
from rapidkit_core.database import AsyncSessionLocal
from sqlmodel import col, select

from plugin_user.models import User


class UserResolverImpl:
    """Concrete UserResolver — queries user by id or username."""

    def __init__(self, session_factory=AsyncSessionLocal):
        self._session_factory = session_factory

    async def get_by_id(self, user_id: UUID) -> UserProtocol | None:
        from plugin_user.crud import UserManageCRUD

        async with self._session_factory() as session:
            crud = UserManageCRUD(session)
            return cast(UserProtocol | None, await crud.get(user_id, nullable=True))

    async def get_by_username(self, username: str) -> UserProtocol | None:
        async with self._session_factory() as session:
            result = await session.exec(select(User).where(User.username == username))
            return cast(UserProtocol | None, result.first())


class UserQueryServiceImpl:
    """Concrete UserQueryService — bulk queries."""

    def __init__(self, session_factory=AsyncSessionLocal):
        self._session_factory = session_factory

    async def get_users_by_role(self, role_code: str) -> list[UserProtocol]:
        async with self._session_factory() as session:
            result = await session.exec(select(User).where(col(User.roles).contains(role_code)))
            return cast(list[UserProtocol], list(result.all()))

    async def get_users_by_department(self, dept_id: UUID) -> list[UserProtocol]:
        from plugin_user.crud import UserManageCRUD

        async with self._session_factory() as session:
            crud = UserManageCRUD(session)
            users = await crud.get_all(col(User.department_id) == dept_id)
            return cast(list[UserProtocol], users)
