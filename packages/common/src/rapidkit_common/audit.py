"""Shared audit snapshots; transaction and HTTP adapters use the same record."""

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator
from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7
from rapidkit_framework.audit import AuditActorType, AuditResult, AuditRiskLevel, AuditSource
from starlette.requests import Request

from rapidkit_common.schemas.base import BaseModel


def is_sensitive_audit_field(name: str) -> bool:
    normalized = "".join(c for c in name.casefold() if c.isalnum())
    return any(
        normalized.endswith(suffix)
        for suffix in (
            "password",
            "token",
            "secret",
            "key",
            "authorization",
            "cookie",
            "verificationcode",
        )
    )


class AuditChange(BaseModel):
    field: str
    before: Any = None
    after: Any = None
    redacted: bool = False

    @model_validator(mode="after")
    def redact_secret(self):
        if self.redacted or is_sensitive_audit_field(self.field):
            self.before = self.after = None
            self.redacted = True
        return self


class AuditTarget(BaseModel):
    resource_type: str = Field(max_length=50)
    resource_id: str = Field(max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = AuditResult.UNKNOWN
    error_message: str | None = Field(default=None, max_length=1024)


class AuditBatch(BaseModel):
    requested: int = Field(ge=0)
    affected: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    failed: int = Field(default=0, ge=0)


class AuditMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject_name: str | None = None
    subject_username: str | None = None
    reason: str | None = None
    end_reason: str | None = None
    changes: list[AuditChange] = Field(default_factory=list)
    batch: AuditBatch | None = None
    initiated_by: dict[str, str | None] | None = None
    task_id: str | None = None
    attempt: int | None = Field(default=None, ge=0)
    attempted_username: str | None = None
    identity_snapshots: dict[str, str | None] = Field(default_factory=dict)


class AuditRecord(BaseModel):
    id: UUID = Field(default_factory=uuid7)
    schema_version: int = 2
    actor_type: AuditActorType = AuditActorType.UNKNOWN
    actor_id: UUID | None = None
    actor_name: str | None = Field(default=None, max_length=100)
    actor_username: str | None = Field(default=None, max_length=100)
    subject_user_id: UUID | None = None
    impersonation_session_id: UUID | None = None
    action: str = Field(max_length=100)
    resource_type: str | None = Field(default=None, max_length=50)
    resource_id: str | None = Field(default=None, max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = AuditResult.UNKNOWN
    risk_level: AuditRiskLevel = AuditRiskLevel.NORMAL
    source: AuditSource = AuditSource.HTTP
    request_id: str | None = Field(default=None, max_length=100)
    correlation_id: str | None = Field(default=None, max_length=100)
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)
    http_method: str | None = Field(default=None, max_length=10)
    path: str | None = Field(default=None, max_length=500)
    request_summary: dict | None = None
    response_code: int | None = None
    business_code: int | None = None
    error_key: str | None = Field(default=None, max_length=150)
    error_message: str | None = Field(default=None, max_length=1024)
    duration_ms: float | None = Field(default=None, ge=0)
    metadata: AuditMetadata = Field(default_factory=AuditMetadata)
    targets: list[AuditTarget] = Field(default_factory=list, exclude=True)
    occurred_at: datetime = Field(default_factory=timezone.now)

    def persistence_data(self) -> dict:
        data = self.model_dump(exclude={"metadata", "targets"})
        data["extra_data"] = self.metadata.model_dump(mode="json", exclude_none=True)
        return data


@dataclass
class AuditContext:
    record: AuditRecord = field(default_factory=lambda: AuditRecord(action="http.request"))
    started: float = field(default_factory=time.monotonic)
    confirmed: bool = False
    deferred: bool = False
    transactional: bool = False
    excluded: bool = False

    def confirm(self, result: AuditResult = AuditResult.SUCCESS) -> None:
        self.record.result = result
        self.confirmed = True

    def snapshot(self) -> AuditRecord:
        record = self.record.model_copy(deep=True)
        record.duration_ms = max(0, (time.monotonic() - self.started) * 1000)
        if record.result not in (AuditResult.SUCCESS, AuditResult.PARTIAL):
            record.metadata.changes = []
        return record


def get_audit_context(request: Request) -> AuditContext | None:
    return getattr(request.state, "audit_context", None)
