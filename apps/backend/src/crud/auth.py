"""
User CRUD logic

This module defines the UserCRUD class responsible for performing
CRUD operations on the `User` model using SQLModel and asynchronous SQLAlchemy sessions.

It provides methods to query user information, such as retrieving a user by their username.

Author : Coke
Date   : 2025-04-18
"""

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.crud.crud_sqlmodel import BaseSQLModelCRUD
from src.models.manage import User
from src.schemas.auth import UserCreate, UserUpdate


class UserCRUD(BaseSQLModelCRUD[User, UserCreate, UserUpdate]):
    """基于 SQLAlchemy 的用户 CRUD 操作。"""

    async def get_user_by_username(self, username: str, *, session: AsyncSession | None = None) -> User:
        """
        通过用户名查询用户。

        Args:
            username: 要查找的用户名。
            session: 可选的数据库会话对象，未提供时使用 self.session。

        Returns:
            User: 匹配的用户对象。

        Raises:
            AppException: 未找到对应用户名的用户时抛出。
        """

        session = session or self.session

        statement = select(self.model).filter(col(self.model.username) == username)
        result = await session.exec(statement)
        response = result.first()

        if not response:
            raise AppException(StatusCode.USER_NOT_FOUND)

        return response
