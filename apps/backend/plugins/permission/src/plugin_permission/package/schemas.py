"""服务器功能包读取与一次性角色应用契约。"""

from typing import Literal

from pydantic import Field
from rapidkit_common.schemas import BaseModel
from rapidkit_common.schemas.request import BaseRequest

from plugin_permission.package.rules import ApplyMode

FieldModeValue = Literal["visible", "masked", "hidden"]


class PackageResponse(BaseModel):
    key: str
    label: str
    description: str
    codes: list[str]
    data_scopes: dict[str, str]
    field_modes: dict[str, dict[str, FieldModeValue]]


class ApplyPackagesBody(BaseRequest):
    package_keys: list[str] = Field(..., min_length=1)
    mode: ApplyMode = "merge"


class ScopeChangeResponse(BaseModel):
    resource: str
    group: str | None = None
    before: str
    after: str


class ApplyPackagesResponse(BaseModel):
    permission_codes: list[str]
    data_scopes: dict[str, str]
    field_modes: dict[str, dict[str, FieldModeValue]]
    added_codes: list[str]
    removed_codes: list[str]
    scope_changes: list[ScopeChangeResponse]
