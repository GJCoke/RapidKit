"""
FieldPolicy request/response schemas.

Author : Coke
Date   : 2026-05-13
"""

from pydantic import field_validator
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema


class FieldPolicyCreate(BaseRequest):
    name: str
    description: str = ""
    target_model: str
    fields: list[str]
    actions: list[str] = ["read", "write"]
    effect: str
    condition: dict | None = None

    @field_validator("effect")
    @classmethod
    def validate_effect(cls, v: str) -> str:
        if v not in ("strip", "mask", "deny"):
            raise ValueError("effect must be 'strip', 'mask', or 'deny'")
        return v

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, v: list[str]) -> list[str]:
        if not v or not set(v).issubset({"read", "write"}):
            raise ValueError("actions must be non-empty subset of ['read', 'write']")
        return v


class FieldPolicyUpdate(BaseRequest):
    name: str | None = None
    description: str | None = None
    fields: list[str] | None = None
    actions: list[str] | None = None
    effect: str | None = None
    condition: dict | None = None

    @field_validator("effect")
    @classmethod
    def validate_effect(cls, v: str | None) -> str | None:
        if v is not None and v not in ("strip", "mask", "deny"):
            raise ValueError("effect must be 'strip', 'mask', or 'deny'")
        return v

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, v: list[str] | None) -> list[str] | None:
        if v is not None and (not v or not set(v).issubset({"read", "write"})):
            raise ValueError("actions must be non-empty subset of ['read', 'write']")
        return v


class FieldPolicyResponse(BaseSchema):
    name: str
    description: str
    target_model: str
    fields: list[str]
    actions: list[str]
    effect: str
    condition: dict | None
    status: str


class FieldPolicyListQuery(PaginatedRequest):
    target_model: str | None = None
