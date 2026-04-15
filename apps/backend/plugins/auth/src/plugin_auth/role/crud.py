"""
User Roles CRUD.

Author  : Coke
Date    : 2025-04-24
"""

from sqlmodel import col
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_common.crud import BaseSQLModelCRUD
from plugin_auth.role.models import Role
from plugin_auth.role.schemas import RoleCreate, RoleUpdate


class RoleCRUD(BaseSQLModelCRUD[Role, RoleCreate, RoleUpdate]):
    """基于 SQLAlchemy 的角色 CRUD 操作。"""

    async def get_role_by_codes(self, codes: list[str], *, session: AsyncSession | None = None) -> list[Role]:
        session = session or self.session
        roles = await self.get_all(col(self.model.code).in_(codes), session=session)
        return roles
