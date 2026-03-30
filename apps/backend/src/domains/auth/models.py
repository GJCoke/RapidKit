"""
Auth database models.

Author  : Coke
Date    : 2025-04-18
"""

from pydantic import EmailStr
from sqlmodel import JSON, Column, Field

from src.common.models import SQLModel
from src.utils.enums import Status


class User(SQLModel, table=True):
    """用户模型"""

    __tablename__ = "manage_users"

    name: str = Field(..., min_length=2, max_length=100, description="用户名")
    email: EmailStr = Field(..., unique=True, max_length=254, description="用户邮箱地址")
    username: str = Field(..., unique=True, min_length=5, max_length=100, description="用户登录名")
    password: bytes
    status: Status = Field(Status.ON, description="用户状态")
    is_admin: bool = Field(False, description="是否为管理员")
    roles: list[str] = Field([], sa_column=Column(JSON), description="用户角色编码列表")
