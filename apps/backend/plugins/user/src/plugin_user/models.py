"""
User database model.

Author : Coke
Date   : 2026-05-11
"""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr
from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field


class User(SQLModel, table=True):
    """用户模型"""

    __tablename__ = "user_users"

    name: str = Field(..., min_length=2, max_length=100, description="用户名")
    email: EmailStr = Field(..., unique=True, max_length=254, description="用户邮箱地址")
    username: str = Field(..., unique=True, min_length=5, max_length=100, description="用户登录名")
    password: bytes
    phone: str | None = Field(default=None, max_length=20, description="手机号")
    avatar: str | None = Field(default=None, max_length=500, description="头像 URL")
    nickname: str | None = Field(default=None, max_length=100, description="昵称")
    gender: str | None = Field(default=None, max_length=10, description="性别: male/female/other")
    status: Status = Field(Status.ON, description="用户状态")
    is_admin: bool = Field(False, description="是否为管理员")
    roles: list[str] = Field([], sa_column=Column(JSON), description="用户角色编码列表")
    department_id: UUID | None = Field(default=None, index=True, description="所属部门 ID")
    last_login_time: datetime | None = Field(default=None, description="最后登录时间")
    last_login_ip: str | None = Field(default=None, max_length=45, description="最后登录 IP")
    remark: str | None = Field(default=None, max_length=500, description="备注")
