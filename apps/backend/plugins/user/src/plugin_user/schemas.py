"""
用户管理相关数据结构。

Author : Coke
Date   : 2026-04-02
"""

from rapidkit_common.schemas import BaseModel, BaseRequest, ResponseSchema
from rapidkit_common.schemas.request import BatchRequest, PaginatedRequest
from rapidkit_common.enums import Status


class UserManageSchema(BaseModel):
    """用户管理基础数据结构。"""

    name: str
    email: str
    username: str
    status: Status = Status.ON
    roles: list[str] = []
    is_admin: bool = False


class UserManageResponse(UserManageSchema, ResponseSchema):
    """用户管理响应数据结构（不含密码）。"""


class UserManageCreate(UserManageSchema, BaseRequest):
    """创建用户请求数据结构。"""

    password: str  # RSA 加密的密码


class UserManageUpdate(BaseRequest):
    """更新用户请求数据结构（所有字段可选）。"""

    name: str | None = None
    email: str | None = None
    username: str | None = None
    password: str | None = None
    status: Status | None = None
    roles: list[str] | None = None
    is_admin: bool | None = None


class UserManageQueriesSchema(BaseModel):
    """用户查询数据结构。"""

    keyword: str = ""
    status: Status | None = None


class UserManagePageQuery(UserManageQueriesSchema, PaginatedRequest):
    """用户分页查询请求。"""


class UserManageBatchBody(BatchRequest):
    """批量用户操作数据结构。"""
