"""
用户管理 CRUD 操作。

Author : Coke
Date   : 2026-04-02
"""

from src.common.crud import BaseSQLModelCRUD
from src.domains.auth.models import User
from src.domains.user.schemas import UserManageCreate, UserManageUpdate


class UserManageCRUD(BaseSQLModelCRUD[User, UserManageCreate, UserManageUpdate]):
    """基于 SQLAlchemy 的用户管理 CRUD 操作。"""
