"""
Protocol 实现 — 跨插件服务提供者。

Author : Coke
Date   : 2026-05-11
"""

from typing import cast
from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.protocols.user import UserDisplayProfile, UserProtocol, UserPublicProfile
from rapidkit_core.database import AsyncSessionLocal
from sqlalchemy import Uuid, column, table, text
from sqlalchemy import cast as sql_cast
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import col, select
from sqlmodel.sql.expression import Select

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

    async def get_display_profiles(self, user_ids: list[UUID]) -> dict[UUID, UserDisplayProfile]:
        """Project historical recipient identities in at most two queries, without active-user filtering."""
        if not user_ids:
            return {}
        async with self._session_factory() as session:
            users = (
                await session.exec(
                    Select(
                        col(User.id),
                        col(User.name),
                        col(User.username),
                        col(User.avatar),
                        col(User.status),
                        col(User.department_id),
                    ).where(col(User.id).in_(set(user_ids)))
                )
            ).all()
            department_ids = {user.department_id for user in users if user.department_id is not None}
            department_names = {}
            if department_ids:
                departments = table("dept_departments", column("id", Uuid), column("name"))
                department_names = dict(
                    (
                        await session.exec(
                            select(departments.c.id, departments.c.name).where(departments.c.id.in_(department_ids))
                        )
                    ).all()
                )
            return {
                user.id: UserDisplayProfile(
                    id=user.id,
                    name=user.name or "",
                    username=user.username or "",
                    avatar=user.avatar,
                    status=user.status.value,
                    department=department_names.get(user.department_id) or "",
                )
                for user in users
            }

    async def get_public_profiles(self, user_ids: list[UUID]) -> dict[UUID, UserPublicProfile]:
        """Read public user fields and relationship names in at most three queries.

        Core table clauses avoid importing another plugin's ORM models. Role
        codes are sorted so display names keep a deterministic order.
        """
        if not user_ids:
            return {}
        async with self._session_factory() as session:
            users = (
                await session.exec(
                    Select(
                        col(User.id), col(User.name), col(User.email), col(User.roles), col(User.department_id)
                    ).where(col(User.id).in_(user_ids), col(User.status) == Status.ON)
                )
            ).all()
            role_codes = {code for user in users for code in (user.roles or [])}
            department_ids = {user.department_id for user in users if user.department_id is not None}
            role_names = {}
            department_names = {}
            if role_codes:
                roles = table("permission_roles", column("code"), column("name"))
                rows = (
                    await session.exec(select(roles.c.code, roles.c.name).where(roles.c.code.in_(sorted(role_codes))))
                ).all()
                role_names = dict(rows)
            if department_ids:
                departments = table("dept_departments", column("id", Uuid), column("name"))
                rows = (
                    await session.exec(
                        select(departments.c.id, departments.c.name).where(departments.c.id.in_(department_ids))
                    )
                ).all()
                department_names = dict(rows)
            return {
                user.id: UserPublicProfile(
                    id=user.id,
                    name=user.name or "",
                    email=user.email or "",
                    roles="、".join(role_names[code] for code in sorted(set(user.roles or [])) if role_names.get(code)),
                    department=department_names.get(user.department_id) or "",
                )
                for user in users
            }

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
                    sql_cast(col(User.roles), JSONB).contains([role_code]),
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
