"""
功能包模型。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field


class PermissionPackage(SQLModel, table=True):
    """功能包：权限码的命名集合，可附带数据范围与字段状态。"""

    __tablename__ = "permission_packages"

    key: str = Field(..., unique=True, max_length=100, description="功能包 key")
    label: str = Field(..., max_length=100, description="功能包名称")
    description: str = Field(default="", max_length=500, description="功能包描述")
    codes: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False), description="直接权限码")

    data_scopes: dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}, server_default="{}"),
        description="功能包附带的 资源 → 数据范围键",
    )
    field_modes: dict[str, dict[str, str]] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}, server_default="{}"),
        description="功能包附带的 资源 → 字段组 → 状态",
    )
    builtin: bool = Field(default=False, description="是否为代码内置（只读）")
