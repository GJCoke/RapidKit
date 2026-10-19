"""
Permission extension request/response schemas.

Author : Coke
Date   : 2026-10-17
"""

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import LocalDatetime

ExtensionKindValue = Literal["route_binding", "depends", "custom_code"]


class ExtensionCreate(BaseRequest):
    kind: ExtensionKindValue
    code: str = Field(min_length=3, max_length=100)
    route_key: str | None = Field(default=None, max_length=500)
    depends_on: str | None = Field(default=None, max_length=100)
    resource: str | None = Field(default=None, max_length=100)
    label: str | None = Field(default=None, max_length=100)
    abac_action: Literal["read", "write"] | None = None
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def check_kind_fields(self) -> "ExtensionCreate":
        """按 kind 要求必填字段，并清空无关字段。"""
        if self.kind == "route_binding":
            if not self.route_key:
                raise ValueError("route_key is required for route_binding")
            self.depends_on = self.resource = self.label = self.abac_action = None
        elif self.kind == "depends":
            if not self.depends_on:
                raise ValueError("depends_on is required for depends")
            self.route_key = self.resource = self.label = self.abac_action = None
        else:
            if not (self.resource and self.label and self.abac_action):
                raise ValueError("resource, label and abac_action are required for custom_code")
            self.route_key = self.depends_on = None
        return self


class ExtensionUpdate(BaseRequest):
    """只允许修改非结构字段；结构变化请删除后重建。"""

    note: str | None = Field(default=None, max_length=500)
    label: str | None = Field(default=None, max_length=100)
    abac_action: Literal["read", "write"] | None = None


class ExtensionResponse(BaseSchema):
    kind: ExtensionKindValue
    code: str
    route_key: str | None
    depends_on: str | None
    resource: str | None
    label: str | None
    abac_action: str | None
    note: str
    created_by: UUID | None
    status: Literal["active", "cleanable", "invalid"]
    reason: str | None


class ExtensionListQuery(BaseRequest):
    kind: ExtensionKindValue | None = None
    status: Literal["active", "cleanable", "invalid"] | None = None


class ExtensionExport(BaseModel):
    text: str


class DenialQuery(BaseRequest):
    days: int = Field(default=7, ge=1, le=7)


class DenialRecord(BaseModel):
    code: str
    route_key: str
    code_label: str | None = None
    count: int
    last_at: LocalDatetime | None = None
    last_user_id: UUID | None = None
