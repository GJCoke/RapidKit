"""
用户管理依赖注入。

Author : Coke
Date   : 2026-04-02
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_user.crud import UserManageCRUD


async def get_user_manage_crud(session: SessionDep) -> UserManageCRUD:
    return UserManageCRUD(session)


UserManageCrudDep = Annotated[
    UserManageCRUD,
    Depends(get_user_manage_crud),
    Doc("依赖项：提供 UserManageCRUD 实例，用于用户管理数据操作。"),
]
