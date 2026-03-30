"""
Author  : Coke
Date    : 2025-04-24
"""

from uuid import UUID

from src.common.schemas import BaseModel, BaseRequest, ResponseSchema
from src.common.schemas.request import BatchRequest, PaginatedRequest
from src.utils.enums import Status


class RoleSchema(BaseModel):
    """角色数据结构。"""

    name: str
    description: str
    code: str
    status: Status = Status.ON
    interface_permissions: list[str] = []
    button_permissions: list[str] = []
    router_permissions: list[str] = []


class RoleResponse(RoleSchema, ResponseSchema):
    """角色响应数据结构。"""

    id: UUID


class RoleCreate(RoleSchema, BaseRequest):
    """创建角色数据结构。"""


class RoleUpdate(RoleSchema, BaseRequest):
    """更新角色数据结构。"""


class RoleQueriesSchema(BaseModel):
    """角色查询数据结构。"""

    keyword: str = ""
    status: Status | None = None


class RolePageQuery(RoleQueriesSchema, PaginatedRequest):
    """分页角色查询数据结构。"""


class RoleAllQuery(RoleQueriesSchema):
    """全部角色查询数据结构。"""


class RoleBatchBody(BatchRequest):
    """批量角色操作数据结构。"""
