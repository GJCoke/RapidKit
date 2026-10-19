"""
功能包请求 / 响应结构。

Author : Coke
Date   : 2026-10-17
"""

import re
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema
from rapidkit_common.schemas import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema

from plugin_permission.package.rules import ApplyMode

_CUSTOM_KEY = re.compile(r"^custom\.[a-z][a-z0-9-]*$")


def _unique_codes(codes: list[str]) -> list[str]:
    unique = list(dict.fromkeys(codes))
    if not unique:
        raise ValueError("codes must not be empty")
    return unique


FieldModeValue = Literal["visible", "masked", "hidden"]


class PackageCreate(BaseRequest):
    key: str = Field(..., max_length=100)
    label: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    codes: list[str]
    data_scopes: dict[str, str] = {}
    field_modes: dict[str, dict[str, FieldModeValue]] = {}

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not _CUSTOM_KEY.fullmatch(v):
            raise ValueError("custom package key must match 'custom.<kebab-case>'")
        return v

    @field_validator("codes")
    @classmethod
    def validate_codes(cls, v: list[str]) -> list[str]:
        return _unique_codes(v)


class PackageUpdate(BaseRequest):
    label: str | SkipJsonSchema[None] = Field(default=None, min_length=1, max_length=100)
    description: str | SkipJsonSchema[None] = Field(default=None, max_length=500)
    codes: list[str] | SkipJsonSchema[None] = None
    data_scopes: dict[str, str] | SkipJsonSchema[None] = None
    field_modes: dict[str, dict[str, FieldModeValue]] | SkipJsonSchema[None] = None

    @field_validator("codes")
    @classmethod
    def validate_codes(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _unique_codes(v)

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, data):
        if isinstance(data, dict):
            fields = {"label", "description", "codes", "data_scopes", "dataScopes", "field_modes", "fieldModes"}
            if any(key in data and data[key] is None for key in fields):
                raise ValueError("Package fields cannot be null")
        return data


class PackageResponse(BaseSchema):
    key: str
    label: str
    description: str
    codes: list[str]
    data_scopes: dict[str, str]
    field_modes: dict[str, dict[str, FieldModeValue]]
    builtin: bool


class PackageListQuery(PaginatedRequest):
    keyword: str = ""


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
