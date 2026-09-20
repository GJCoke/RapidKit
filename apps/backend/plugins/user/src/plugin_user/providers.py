"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from typing import cast
from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.protocols.user import UserProtocol
from rapidkit_core.database import AsyncSessionLocal
from sqlalchemy import text
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

    async def get_active_user_ids(self, user_ids: list[UUID]) -> list[UUID]:
        if not user_ids:
            return []
        async with self._session_factory() as session:
            result = await session.exec(
                select(User.id).where(
                    col(User.id).in_(user_ids),
                    col(User.status) == Status.ON,
                )
            )
            active = set(result.all())
            return [user_id for user_id in user_ids if user_id in active]

    async def get_active_user_ids_by_role(self, role_code: str) -> list[UUID]:
        async with self._session_factory() as session:
            result = await session.exec(
                select(User.id).where(
                    col(User.roles).contains(role_code),
                    col(User.status) == Status.ON,
                )
            )
            return list(result.all())

    async def get_active_user_ids_by_department(
        self,
        dept_id: UUID,
        include_descendants: bool = False,
    ) -> list[UUID]:
        async with self._session_factory() as session:
            department_ids = [dept_id]
            if include_descendants:
                result = await session.execute(
                    text(
                        "WITH RECURSIVE department_tree AS ("
                        " SELECT id FROM dept_departments WHERE id = :department_id"
                        " UNION ALL"
                        " SELECT child.id FROM dept_departments child"
                        " JOIN department_tree parent ON child.parent_id = parent.id"
                        ") SELECT id FROM department_tree"
                    ),
                    {"department_id": dept_id},
                )
                department_ids = list(result.scalars().all())
            result = await session.exec(
                select(User.id).where(
                    col(User.department_id).in_(department_ids),
                    col(User.status) == Status.ON,
                )
            )
            return list(result.all())

    async def get_all_active_user_ids(self) -> list[UUID]:
        async with self._session_factory() as session:
            result = await session.exec(select(User.id).where(col(User.status) == Status.ON))
            return list(result.all())
