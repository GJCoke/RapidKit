"""
User Roles CRUD.

Author  : Coke
Date    : 2025-04-24
"""

from rapidkit_common.crud import BaseCRUD
from sqlmodel import col

from plugin_auth.role.models import Role


class RoleCRUD(BaseCRUD[Role]):
    """基于 SQLAlchemy 的角色 CRUD 操作。"""

    model = Role

    async def get_role_by_codes(self, codes: list[str]) -> list[Role]:
        roles = await self.get_all(col(self.model.code).in_(codes))
        return roles
