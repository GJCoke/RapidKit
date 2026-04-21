"""
Role database model.

Author  : Coke
Date    : 2025-04-18
"""

from uuid import UUID

from rapidkit_common.enums import DataScope, Status
from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field


class Role(SQLModel, table=True):
    """角色模型"""

    __tablename__ = "auth_roles"

    name: str = Field(..., unique=True, min_length=2, max_length=100, description="角色名称")
    description: str | None = Field(None, max_length=500, description="角色描述")
    code: str = Field(..., unique=True, min_length=5, max_length=100, description="角色编码")
    status: Status = Field(Status.ON, description="角色状态")
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="接口权限编码列表")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="按钮权限编码列表")
    router_permissions: list[str] = Field([], sa_column=Column(JSON), description="路由权限编码列表")

    # 数据级权限
    data_scope: DataScope = Field(default=DataScope.SELF, description="数据范围")
    custom_dept_ids: list[UUID] = Field(
        default_factory=list, sa_column=Column(JSON, default=[]), description="自定义部门列表"
    )
    data_rule_ids: list[UUID] = Field(
        default_factory=list, sa_column=Column(JSON, default=[]), description="数据规则 ID 列表"
    )
