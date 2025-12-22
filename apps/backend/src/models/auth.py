"""
Auth database models.

Author  : Coke
Date    : 2025-04-18
"""

from pydantic import EmailStr
from sqlmodel import JSON, Column, Field

from .base import SQLModel


class User(SQLModel, table=True):
    """用户模型。"""

    __tablename__ = "users"

    name: str = Field(..., min_length=2, max_length=100, description="用户名")
    email: EmailStr = Field(..., unique=True, max_length=254, description="用户邮箱地址")
    username: str = Field(..., unique=True, min_length=5, max_length=100, description="用户登录名")
    password: bytes
    status: bool = Field(True, description="用户状态")
    is_admin: bool = Field(False, description="是否为管理员")
    roles: list[str] = Field([], sa_column=Column(JSON), description="用户角色编码列表")


class Role(SQLModel, table=True):
    """角色模型。"""

    __tablename__ = "roles"

    name: str = Field(..., unique=True, min_length=2, max_length=100, description="角色名称")
    description: str | None = Field(None, max_length=500, description="角色描述")
    code: str = Field(..., unique=True, min_length=5, max_length=100, description="角色编码")
    status: bool = Field(True, description="角色状态")
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="接口权限编码列表")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="按钮权限编码列表")
    router_permissions: list[str] = Field([], sa_column=Column(JSON), description="路由权限编码列表")
