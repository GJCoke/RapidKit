"""
部门请求/响应 Schema。

Author : Coke
Date   : 2026-04-20
"""

from uuid import UUID

from pydantic import Field as PydanticField
from rapidkit_common.enums import Status
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.response import BaseSchema


class DepartmentResponse(BaseSchema):
    """部门响应。"""

    parent_id: UUID | None = None
    name: str
    code: str
    sort: int
    status: Status
    leader_id: UUID | None = None


class DepartmentTreeNode(DepartmentResponse):
    """部门树节点。"""

    children: list["DepartmentTreeNode"] = []


class DepartmentCreate(BaseModel):
    """创建部门请求。"""

    parent_id: UUID | None = None
    name: str = PydanticField(max_length=100)
    code: str = PydanticField(max_length=50)
    sort: int = 0
    status: Status = Status.ON
    leader_id: UUID | None = None


class DepartmentUpdate(BaseModel):
    """更新部门请求。"""

    parent_id: UUID | None = None
    name: str | None = PydanticField(None, max_length=100)
    code: str | None = PydanticField(None, max_length=50)
    sort: int | None = None
    status: Status | None = None
    leader_id: UUID | None = None
