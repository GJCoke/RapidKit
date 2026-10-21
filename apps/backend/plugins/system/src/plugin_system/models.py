"""Persistence models for technical audits and human-readable activity."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from rapidkit_common.models import SQLModel
from rapidkit_core.timezone import timezone
from rapidkit_framework.audit import AuditActorType, AuditResult, AuditRiskLevel, AuditSource
from sqlalchemy import Enum as SQLAlchemyEnum
from sqlalchemy import Index, UniqueConstraint
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


def _varchar_enum(enum_type: type[StrEnum]) -> SQLAlchemyEnum:
    return SQLAlchemyEnum(
        enum_type,
        native_enum=False,
        values_callable=lambda members: [member.value for member in members],
    )


class AuditLog(SQLModel, table=True):
    """Technical record used for security review and diagnostics."""

    __tablename__ = "system_audit_logs"
    __table_args__ = (
        Index("ix_audit_time_id", "occurred_at", "id"),
        Index("ix_audit_resource_time_id", "resource_type", "resource_id", "occurred_at", "id"),
        Index("ix_audit_actor_time_id", "actor_id", "occurred_at", "id"),
    )

    schema_version: int = Field(default=1, sa_column_kwargs={"server_default": "1"})
    actor_type: AuditActorType = Field(
        default=AuditActorType.UNKNOWN,
        sa_column=Column(_varchar_enum(AuditActorType), nullable=False, server_default="unknown"),
    )
    actor_username: str | None = Field(default=None, max_length=100)
    business_code: int | None = None
    error_key: str | None = Field(default=None, max_length=150)
    duration_ms: float | None = Field(default=None, ge=0)

    actor_id: UUID | None = Field(default=None, index=True)
    subject_user_id: UUID | None = Field(default=None, index=True)
    impersonation_session_id: UUID | None = Field(default=None, index=True)
    actor_name: str | None = Field(default=None, max_length=100)
    action: str = Field(max_length=100, index=True)
    resource_type: str | None = Field(default=None, max_length=50, index=True)
    resource_id: str | None = Field(default=None, max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = Field(sa_column=Column(_varchar_enum(AuditResult), index=True, nullable=False))
    risk_level: AuditRiskLevel = Field(
        default=AuditRiskLevel.NORMAL,
        sa_column=Column(_varchar_enum(AuditRiskLevel), index=True, nullable=False, default=AuditRiskLevel.NORMAL),
    )
    source: AuditSource = Field(sa_column=Column(_varchar_enum(AuditSource), index=True, nullable=False))
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


class AuditLogTarget(SQLModel, table=True):
    __tablename__ = "system_audit_log_targets"
    __table_args__ = (Index("ix_audit_target_resource", "resource_type", "resource_id", "audit_log_id"),)

    audit_log_id: UUID = Field(foreign_key="system_audit_logs.id", index=True)
    resource_type: str = Field(max_length=50)
    resource_id: str = Field(max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = Field(sa_column=Column(_varchar_enum(AuditResult), nullable=False))
    error_message: str | None = Field(default=None, max_length=1024)


class ActivityEvent(SQLModel, table=True):
    """Curated, localized dashboard activity projected from domain events."""

    __tablename__ = "system_activity_events"
    __table_args__ = (UniqueConstraint("source_event_id", name="uq_system_activity_source_event_id"),)

    category: ActivityCategory = Field(sa_column=Column(_varchar_enum(ActivityCategory), index=True, nullable=False))
    event_code: str = Field(max_length=100, index=True)
    level: ActivityLevel = Field(sa_column=Column(_varchar_enum(ActivityLevel), index=True, nullable=False))
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
