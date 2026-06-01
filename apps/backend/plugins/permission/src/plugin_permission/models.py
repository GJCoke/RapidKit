"""
RBAC database models.

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field


class Role(SQLModel, table=True):
    """角色模型"""

    __tablename__ = "permission_roles"

    name: str = Field(..., unique=True, min_length=2, max_length=100, description="角色名称")
    description: str | None = Field(None, max_length=500, description="角色描述")
    code: str = Field(..., unique=True, min_length=5, max_length=100, description="角色编码")
    status: Status = Field(Status.ON, description="角色状态")
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="接口权限编码列表")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="按钮权限编码列表")
    router_permissions: list[str] = Field([], sa_column=Column(JSON), description="路由权限编码列表")
    data_policy_ids: list[UUID] = Field(
        default_factory=list, sa_column=Column(JSON, default=[]), description="关联数据策略 ID 列表"
    )
    field_policy_ids: list[UUID] = Field(
        default_factory=list, sa_column=Column(JSON, default=[]), description="关联字段策略 ID 列表"
    )


class InterfaceRouter(SQLModel, table=True):
    """FastAPI 应用路由模型"""

    __tablename__ = "permission_routers"

    name: str = Field(..., unique=True, max_length=100, description="接口路由功能名称")
    description: str | None = Field(None, description="接口路由功能描述")
    path: str = Field(..., description="接口路由路径")
    methods: list[str] = Field([], sa_column=Column(JSON), description="接口路由方法列表")


class DataPolicy(SQLModel, table=True):
    """数据策略模型"""

    __tablename__ = "permission_data_policies"

    name: str = Field(max_length=100, description="策略名称")
    description: str = Field(default="", max_length=500, description="策略描述")
    target_model: str = Field(max_length=100, description="目标模型 tablename")
    rule: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False), description="规则树 JSON")
    effect: str = Field(default="allow", max_length=10, description="策略效果: allow/deny")
    actions: list[str] = Field(
        default_factory=lambda: ["read", "write"],
        sa_column=Column(JSON, nullable=False, default=["read", "write"]),
        description="适用动作: read/write",
    )
    status: Status = Field(default=Status.ON, description="启用/禁用")
