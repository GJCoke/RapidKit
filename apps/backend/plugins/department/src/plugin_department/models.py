"""
Department database model.

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from sqlmodel import Field


class Department(SQLModel, table=True):
    """部门（树形结构）。"""

    __tablename__ = "dept_departments"

    parent_id: UUID | None = Field(default=None, index=True, description="父部门 ID")
    name: str = Field(max_length=100, description="部门名称")
    code: str = Field(max_length=50, unique=True, description="部门编码")
    sort: int = Field(default=0, description="排序")
    status: Status = Field(default=Status.ON, description="状态")
    leader_id: UUID | None = Field(default=None, description="部门负责人 ID")
