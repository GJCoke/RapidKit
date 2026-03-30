"""
InterfaceRouter database model.

Author  : Coke
Date    : 2025-04-18
"""

from sqlmodel import JSON, Column, Field

from src.common.models import SQLModel


class InterfaceRouter(SQLModel, table=True):
    """FastAPI 应用路由模型"""

    __tablename__ = "manage_routers"

    name: str = Field(..., unique=True, max_length=100, description="接口路由功能名称")
    description: str | None = Field(None, description="接口路由功能描述")
    path: str = Field(..., description="接口路由路径")
    methods: list[str] = Field([], sa_column=Column(JSON), description="接口路由方法列表")
