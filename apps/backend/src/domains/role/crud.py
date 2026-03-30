"""
User Roles CRUD.

Author  : Coke
Date    : 2025-04-24
"""

from sqlmodel import col
from sqlmodel.ext.asyncio.session import AsyncSession

from src.common.crud import BaseSQLModelCRUD
from src.domains.role.models import Role
from src.domains.role.schemas import RoleCreate, RoleUpdate


class RoleCRUD(BaseSQLModelCRUD[Role, RoleCreate, RoleUpdate]):
    """基于 SQLAlchemy 的角色 CRUD 操作。"""

    async def get_role_by_codes(self, codes: list[str], *, session: AsyncSession | None = None) -> list[Role]:
        """
        根据角色编码列表查询角色。

        Args:
            codes: 用于筛选角色的编码列表。
            session: 可选 SQLAlchemy 异步会话，未提供时使用默认会话。

        Returns:
            List[Role]: 匹配给定编码的角色对象列表。
        """
        session = session or self.session
        roles = await self.get_all(col(self.model.code).in_(codes), session=session)
        return roles
