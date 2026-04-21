"""
Auth database models.

Author  : Coke
Date    : 2025-04-18
"""

from uuid import UUID

from pydantic import EmailStr
from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field


class User(SQLModel, table=True):
    """用户模型"""

    __tablename__ = "auth_users"

    name: str = Field(..., min_length=2, max_length=100, description="用户名")
    email: EmailStr = Field(..., unique=True, max_length=254, description="用户邮箱地址")
    username: str = Field(..., unique=True, min_length=5, max_length=100, description="用户登录名")
    password: bytes
    status: Status = Field(Status.ON, description="用户状态")
    is_admin: bool = Field(False, description="是否为管理员")
    roles: list[str] = Field([], sa_column=Column(JSON), description="用户角色编码列表")
    department_id: UUID | None = Field(
        default=None, foreign_key="auth_departments.id", index=True, description="所属部门 ID"
    )
