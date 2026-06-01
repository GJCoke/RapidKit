"""
FieldPolicy model — field-level access control.

Author : Coke
Date   : 2026-05-13
"""

from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from sqlalchemy import JSON, Column
from sqlmodel import Field


class FieldPolicy(SQLModel, table=True):
    """字段权限策略模型"""

    __tablename__ = "permission_field_policies"

    name: str = Field(max_length=100, description="策略名称")
    description: str = Field(default="", max_length=500, description="策略描述")
    target_model: str = Field(max_length=100, description="目标模型 tablename")
    fields: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
        description="受控字段列表",
    )
    actions: list[str] = Field(
        default_factory=lambda: ["read", "write"],
        sa_column=Column(JSON, nullable=False, default=["read", "write"]),
        description="适用动作: read/write",
    )
    effect: str = Field(max_length=10, description="效果: strip/mask/deny")
    condition: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="可选条件规则 (RuleNode format)",
    )
    status: Status = Field(default=Status.ON, description="启用/禁用")
