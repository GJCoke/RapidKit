"""
RBAC database models.

Author : Coke
Date   : 2026-05-11
"""

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
    permission_codes: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=[], server_default="[]"),
        description="直接授予的权限码（未展开 depends）",
    )
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="已废弃：旧接口权限，仅迁移读取")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="已废弃：旧按钮权限，仅迁移读取")
    router_permissions: list[str] = Field(
        [], sa_column=Column(JSON), description="已废弃：旧路由权限，P3 前用于自定义菜单可见性"
    )

    data_scopes: dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}, server_default="{}"),
        description="资源 → 数据范围键；未出现的资源为全部",
    )
    field_modes: dict[str, dict[str, str]] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}, server_default="{}"),
        description="资源 → 字段组 → 状态（masked / hidden）；未出现为可见",
    )
