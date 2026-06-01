"""
Author  : Coke
Date    : 2025-04-22
"""

from uuid import UUID

from pydantic import computed_field
from rapidkit_common.schemas import BaseModel, BaseRequest, ResponseSchema

from plugin_permission.utils import build_route_key


class InterfaceRouterSchema(BaseModel):
    """接口路由数据结构。"""

    name: str
    description: str
    path: str
    methods: list[str]


class FastAPIRouterResponse(InterfaceRouterSchema, ResponseSchema):
    """接口路由响应数据结构。"""

    @computed_field
    def code(self) -> str:
        return build_route_key(self.methods, self.path)


class FastAPIRouterCreate(InterfaceRouterSchema, BaseRequest):
    """创建接口路由数据结构。"""


class FastAPIRouterUpdate(InterfaceRouterSchema, BaseRequest):
    """更新接口路由数据结构。"""

    id: UUID
