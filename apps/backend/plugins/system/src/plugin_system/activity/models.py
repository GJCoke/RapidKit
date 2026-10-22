from datetime import datetime
from enum import StrEnum
from uuid import UUID

from rapidkit_common.models import SQLModel
from sqlalchemy import UniqueConstraint
from sqlmodel import JSON, Column, Field

from plugin_system.model_types import _varchar_enum


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
