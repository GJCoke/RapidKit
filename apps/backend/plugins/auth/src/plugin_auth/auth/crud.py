"""
User CRUD logic.

Author : Coke
Date   : 2025-04-18
"""

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_common.crud import BaseSQLModelCRUD
from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode
from plugin_auth.auth.models import User
from plugin_auth.auth.schemas import UserCreate, UserUpdate


class UserCRUD(BaseSQLModelCRUD[User, UserCreate, UserUpdate]):
    """基于 SQLAlchemy 的用户 CRUD 操作。"""

    async def get_user_by_username(self, username: str, *, session: AsyncSession | None = None) -> User:
        session = session or self.session

        statement = select(self.model).filter(col(self.model.username) == username)
        result = await session.exec(statement)
        response = result.first()

        if not response:
            raise AppException(StatusCode.USER_NOT_FOUND)

        return response
