"""
用户管理相关数据结构。

Author : Coke
Date   : 2026-04-02
"""

from uuid import UUID

from pydantic import EmailStr, Field
from rapidkit_common.enums import Status
from rapidkit_common.schemas import BaseModel, BaseRequest, ResponseSchema
from rapidkit_common.schemas.request import BatchRequest, PaginatedRequest
from rapidkit_common.schemas.response import BaseResponse
from rapidkit_common.schemas.types import LocalDatetime


class UserManageSchema(BaseModel):
    """用户管理基础数据结构。"""

    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr = Field(..., max_length=254)
    username: str = Field(..., min_length=5, max_length=100)
    phone: str | None = None
    avatar: str | None = None
    nickname: str | None = None
    gender: str | None = None
    status: Status = Status.ON
    roles: list[str] = []
    is_admin: bool = False
    department_id: UUID | None = None
    remark: str | None = None


class UserManageResponse(UserManageSchema, ResponseSchema):
    """用户管理响应数据结构（不含密码）。"""

    last_login_time: LocalDatetime | None = None
    last_login_ip: str | None = None


class UserManageOptionResponse(BaseResponse):
    """用户选项响应（精简字段，用于下拉选择）。"""

    id: UUID
    name: str
    username: str


class UserManageCreate(UserManageSchema, BaseRequest):
    """创建用户请求数据结构。"""

    password: str  # RSA 加密的密码


class UserManageUpdate(BaseRequest):
    """更新用户请求数据结构（所有字段可选）。"""

    name: str | None = Field(None, min_length=2, max_length=100)
    email: EmailStr | None = Field(None, max_length=254)
    username: str | None = Field(None, min_length=5, max_length=100)
    phone: str | None = None
    avatar: str | None = None
    nickname: str | None = None
    gender: str | None = None
    status: Status | None = None
    roles: list[str] | None = None
    is_admin: bool | None = None
    department_id: UUID | None = None
    remark: str | None = None


class UserManageQueriesSchema(BaseModel):
    """用户查询数据结构。"""

    keyword: str = ""
    status: Status | None = None


class UserManagePageQuery(UserManageQueriesSchema, PaginatedRequest):
    """用户分页查询请求。"""


class UserManageBatchBody(BatchRequest):
    """批量用户操作数据结构。"""


class ChangePasswordBody(BaseRequest):
    """修改密码请求数据结构。"""

    old_password: str | None = None
    new_password: str


# ========== 用户统计 ==========


class UserStatsSummary(BaseModel):
    """用户统计摘要。"""

    total: int
    today_new: int
    yesterday_new: int
    online_count: int


class UserActivityTrend(BaseModel):
    """用户活跃趋势。"""

    time_bucket: LocalDatetime
    new_users: int
