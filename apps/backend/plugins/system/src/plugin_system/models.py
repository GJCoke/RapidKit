"""Persistence models for technical audits and human-readable activity."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from rapidkit_common.models import SQLModel
from rapidkit_core.timezone import timezone
from sqlalchemy import UniqueConstraint
from sqlmodel import JSON, Column, Field


class ActivityCategory(StrEnum):
    TASK = "task"
    USER = "user"
    SYSTEM = "system"
    ALERT = "alert"


class ActivityLevel(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class AuditResult(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"


class AuditRiskLevel(StrEnum):
    NORMAL = "normal"
    SENSITIVE = "sensitive"
    CRITICAL = "critical"


class AuditSource(StrEnum):
    HTTP = "http"
    DOMAIN_EVENT = "domain_event"
    SYSTEM = "system"


class AuditLog(SQLModel, table=True):
    """Technical record used for security review and diagnostics."""

    __tablename__ = "system_audit_logs"

    actor_id: UUID | None = Field(default=None, index=True)
    actor_name: str | None = Field(default=None, max_length=100)
    action: str = Field(max_length=100, index=True)
    resource_type: str | None = Field(default=None, max_length=50, index=True)
    resource_id: str | None = Field(default=None, max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = Field(index=True)
    risk_level: AuditRiskLevel = Field(default=AuditRiskLevel.NORMAL, index=True)
    source: AuditSource = Field(index=True)
    request_id: str | None = Field(default=None, max_length=100, index=True)
    correlation_id: str | None = Field(default=None, max_length=100, index=True)
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)
    http_method: str | None = Field(default=None, max_length=10)
    path: str | None = Field(default=None, max_length=500)
    request_summary: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    response_code: int | None = None
    error_message: str | None = Field(default=None, max_length=1024)
    extra_data: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON, nullable=False))
    occurred_at: datetime = Field(default_factory=timezone.now, index=True)


class ActivityEvent(SQLModel, table=True):
    """Curated, localized dashboard activity projected from domain events."""

    __tablename__ = "system_activity_events"
    __table_args__ = (UniqueConstraint("source_event_id", name="uq_system_activity_source_event_id"),)

    category: ActivityCategory = Field(index=True)
    event_code: str = Field(max_length=100, index=True)
    level: ActivityLevel = Field(index=True)
    actor_id: UUID | None = Field(default=None, index=True)
    actor_name: str | None = Field(default=None, max_length=100)
    subject_type: str = Field(max_length=50, index=True)
    subject_id: str | None = Field(default=None, max_length=100)
    subject_name: str | None = Field(default=None, max_length=200)
    title_key: str = Field(max_length=150)
    title_params: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    description_key: str | None = Field(default=None, max_length=150)
    description_params: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    extra_data: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON, nullable=False))
    source_event_id: str = Field(max_length=64)
    occurred_at: datetime = Field(index=True)
