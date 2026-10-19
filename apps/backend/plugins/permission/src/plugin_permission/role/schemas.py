"""
Author  : Coke
Date    : 2025-04-24
"""

from typing import Literal
from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.schemas import BaseModel, BaseRequest, ResponseSchema
from rapidkit_common.schemas.request import BatchRequest, PaginatedRequest

from plugin_permission.cache import CachedPermissions


class RoleMetadataSchema(BaseModel):
    """角色基础信息数据结构。"""

    name: str
    description: str
    code: str
    status: Status = Status.ON


FieldModeValue = Literal["visible", "masked", "hidden"]


class RoleSchema(RoleMetadataSchema):
    """角色数据结构。"""

    permission_codes: list[str] = []


class RoleResponse(RoleSchema, ResponseSchema):
    """角色响应数据结构。"""

    id: UUID
    data_scopes: dict[str, str] = {}
    field_modes: dict[str, dict[str, str]] = {}


class RoleCreate(RoleSchema, BaseRequest):
    """创建角色数据结构；数据范围与字段状态在权限配置中设置。"""


class RoleUpdate(RoleMetadataSchema, BaseRequest):
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


class InvalidScopeResponse(BaseModel):
    """因声明变化被收紧处理的一项。"""

    resource: str
    group: str | None = None
    stored: str
    effective: str


class RolePermissionsResponse(BaseModel):
    """角色权限响应：范围与字段状态为实际生效值（不含默认值）。"""

    permission_codes: list[str] = []
    invalid_codes: list[str] = []
    data_scopes: dict[str, str] = {}
    field_modes: dict[str, dict[str, FieldModeValue]] = {}
    invalid_scopes: list[InvalidScopeResponse] = []


class RolePermissionsUpdateBody(BaseRequest):
    """角色权限更新请求；范围或字段状态为 None 时保持不变。"""

    permission_codes: list[str] = []
    data_scopes: dict[str, str] | None = None
    field_modes: dict[str, dict[str, FieldModeValue]] | None = None


class PermissionDeniedDetail(BaseModel):
    """权限不足时随 34001 返回的缺失码信息。"""

    code: str
    label: str
    resource: str
    resource_label: str


UserPermissionCache = CachedPermissions
