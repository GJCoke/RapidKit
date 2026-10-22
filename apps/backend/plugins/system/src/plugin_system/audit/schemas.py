from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator
from rapidkit_common.audit import AuditChange
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import PaginatedRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import LocalDatetime
from rapidkit_framework.audit import AuditActorType, AuditResult, AuditRiskLevel, AuditSource
from rapidkit_framework.i18n import t

from plugin_system.audit.models import AuditLog


class AuditLogQuery(PaginatedRequest):
    page_size: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=200)
    view: Literal["all", "attention", "impersonation", "system"] = "all"
    action: str | None = None
    result: AuditResult | None = None
    actor_id: UUID | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    actor_keyword: str | None = Field(default=None, max_length=100)
    subject_user_id: UUID | None = None
    impersonation_session_id: UUID | None = None
    resource_type: str | None = Field(default=None, max_length=50)
    resource_id: str | None = Field(default=None, max_length=100)
    resource_keyword: str | None = Field(default=None, max_length=200)
    request_id: str | None = Field(default=None, max_length=100)
    correlation_id: str | None = Field(default=None, max_length=100)
    risk_level: AuditRiskLevel | None = None
    source: AuditSource | None = None
    ip: str | None = Field(default=None, max_length=45)

    @model_validator(mode="after")
    def normalize_range(self):
        for key in ("start_time", "end_time"):
            value = getattr(self, key)
            if value is not None and value.tzinfo is not None:
                setattr(self, key, value.astimezone(UTC).replace(tzinfo=None))
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("endTime must be later than startTime")
        return self


class AuditLogListItem(BaseSchema):
    actor_type: AuditActorType = AuditActorType.UNKNOWN
    actor_username: str | None = None
    subject_username: str | None = None
    resource_id: str | None = None
    request_id: str | None = None
    correlation_id: str | None = None
    duration_ms: float | None = None
    business_code: int | None = None
    error_key: str | None = None
    error_message: str | None = None
    target_count: int | None = None
    subject_user_id: UUID | None = None
    impersonation_session_id: UUID | None = None
    subject_name: str | None = None

    @model_validator(mode="before")
    @classmethod
    def project_impersonation_metadata(cls, value):
        if isinstance(value, AuditLog):
            data = value.model_dump()
            data["subject_name"] = value.extra_data.get("subject_name")
            data["subject_username"] = value.extra_data.get("subject_username")
            data["metadata"] = value.extra_data
            data["changes"] = value.extra_data.get("changes", [])
            data["target_count"] = (value.extra_data.get("batch") or {}).get("requested")
            data["http_status"] = value.response_code
            if value.error_key and not value.error_message:
                data["error_message"] = t(value.error_key)
            return data
        return value

    actor_id: UUID | None = None
    actor_name: str | None = None
    action: str
    resource_type: str | None = None
    resource_name: str | None = None
    result: AuditResult
    risk_level: AuditRiskLevel
    source: AuditSource
    ip: str | None = None
    occurred_at: LocalDatetime


class AuditLogDetail(AuditLogListItem):
    changes: list[AuditChange] = Field(default_factory=list)
    http_status: int | None = None
    metadata: dict = Field(default_factory=dict)
    subject_username: str | None = None
    request_id: str | None = None
    correlation_id: str | None = None
    user_agent: str | None = None
    http_method: str | None = None
    path: str | None = None
    request_summary: dict | None = None
    response_code: int | None = None
    error_message: str | None = None


class AuditCatalogAction(BaseModel):
    code: str
    label: str
    resource_type: str
    resource_label: str
    risk_level: AuditRiskLevel
    fields: dict[str, str] = Field(default_factory=dict)


class AuditActorOption(BaseModel):
    id: UUID
    name: str | None = None
    username: str | None = None


class AuditCatalogResponse(BaseModel):
    actions: list[AuditCatalogAction]
    timezone: str


class AuditTargetResponse(BaseSchema):
    resource_type: str
    resource_id: str
    resource_name: str | None = None
    result: AuditResult
    error_message: str | None = None
