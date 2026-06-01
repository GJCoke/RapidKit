"""
DataPolicy request/response schemas.

Author : Coke
Date   : 2026-04-30
"""

from uuid import UUID

from pydantic import Field, field_validator
from rapidkit_common.enums import Status
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_policy_engine.rule_types import parse_rule


class DataPolicyResponse(BaseSchema):
    """数据策略响应。"""

    name: str
    target_model: str
    description: str
    rule: dict
    effect: str
    actions: list[str]
    status: Status


class DataPolicyCreate(BaseModel):
    """创建数据策略请求。"""

    name: str
    target_model: str
    description: str = ""
    rule: dict
    effect: str = "allow"
    actions: list[str] = ["read", "write"]
    status: Status = Status.ON

    @field_validator("rule")
    @classmethod
    def validate_rule_structure(cls, v: dict) -> dict:
        parse_rule(v)
        return v

    @field_validator("effect")
    @classmethod
    def validate_effect(cls, v: str) -> str:
        if v not in ("allow", "deny"):
            raise ValueError("effect must be 'allow' or 'deny'")
        return v

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, v: list[str]) -> list[str]:
        if not v or not set(v).issubset({"read", "write"}):
            raise ValueError("actions must be non-empty subset of ['read', 'write']")
        return v


class DataPolicyUpdate(BaseModel):
    """更新数据策略请求。"""

    name: str | None = None
    target_model: str | None = None
    description: str | None = None
    rule: dict | None = None
    effect: str | None = None
    actions: list[str] | None = None
    status: Status | None = None

    @field_validator("rule")
    @classmethod
    def validate_rule_structure(cls, v: dict | None) -> dict | None:
        if v is not None:
            parse_rule(v)
        return v

    @field_validator("effect")
    @classmethod
    def validate_effect(cls, v: str | None) -> str | None:
        if v is not None and v not in ("allow", "deny"):
            raise ValueError("effect must be 'allow' or 'deny'")
        return v

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, v: list[str] | None) -> list[str] | None:
        if v is not None and (not v or not set(v).issubset({"read", "write"})):
            raise ValueError("actions must be non-empty subset of ['read', 'write']")
        return v


class DataPolicyPageQuery(PaginatedRequest):
    """数据策略分页查询。"""

    keyword: str = ""


class PolicySimulateRequest(BaseModel):
    """策略模拟请求。"""

    policy_ids: list[UUID]
    target_user_id: UUID
    preview_limit: int = Field(default=20, le=100)


class PolicyAppliedDetail(BaseModel):
    """单条策略模拟结果明细。"""

    policy_id: UUID
    policy_name: str
    matched_count: int
    sql_fragment: str


class PolicySimulateResponse(BaseModel):
    """策略模拟响应。"""

    target_model: str
    target_model_label: str
    total_count: int
    filtered_count: int
    excluded_count: int
    preview_rows: list[dict]
    excluded_rows: list[dict]
    generated_sql: str
    policies_applied: list[PolicyAppliedDetail]
    is_admin_bypass: bool = False
