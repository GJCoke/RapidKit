"""
用户管理依赖注入。

Author : Coke
Date   : 2026-04-02
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from src.common.deps import SessionDep
from src.domains.auth.models import User
from src.domains.user.crud import UserManageCRUD


async def get_user_manage_crud(session: SessionDep) -> UserManageCRUD:
    """
    返回初始化了指定会话的 UserManageCRUD 实例。

    Args:
        session: 用于数据库操作的会话依赖。

    Returns:
        UserManageCRUD: 以 User 模型和指定会话初始化的 UserManageCRUD 实例。
    """
    return UserManageCRUD(User, session=session)


UserManageCrudDep = Annotated[
    UserManageCRUD,
    Depends(get_user_manage_crud),
    Doc(
        """
        依赖项：用于访问 UserManageCRUD 实例。

        该依赖会注入用于操作用户数据模型的 UserManageCRUD 实例，
        可在需要基于用户操作的路由中使用。
        """
    ),
]
