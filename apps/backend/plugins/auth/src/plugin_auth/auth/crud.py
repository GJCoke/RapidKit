"""
User CRUD logic.

Author : Coke
Date   : 2025-04-18
"""

from plugin_user.models import User
from rapidkit_common.crud import BaseCRUD
from rapidkit_framework.exceptions import AppException
from sqlmodel import col

from plugin_auth.status_codes import AuthStatusCode


class UserCRUD(BaseCRUD[User]):
    """基于 SQLAlchemy 的用户 CRUD 操作。"""

    model = User

    async def get_user_by_username(self, username: str) -> User:
        stmt = self.select(col(self.model.username) == username)
        result = await self.session.exec(stmt)
        response = result.first()

        if not response:
            raise AppException(AuthStatusCode.USER_NOT_FOUND)

        return response
