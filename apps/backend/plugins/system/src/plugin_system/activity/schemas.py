from uuid import UUID

from pydantic import Field
from rapidkit_common.schemas.request import BaseRequest
from rapidkit_common.schemas.response import BaseSchema
from rapidkit_common.schemas.types import LocalDatetime

from plugin_system.activity.models import ActivityCategory, ActivityEvent, ActivityLevel


class ActivityResponse(BaseSchema):
    """Curated activity response without audit diagnostics."""

    category: ActivityCategory
    event_code: str
    level: ActivityLevel
    actor_id: UUID | None = None
    actor_name: str | None = None
    subject_type: str
    subject_id: str | None = None
    subject_name: str | None = None
    title_key: str
    title_params: dict = Field(default_factory=dict)
    description_key: str | None = None
    description_params: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    occurred_at: LocalDatetime

    @classmethod
    def from_record(cls, record: ActivityEvent) -> "ActivityResponse":
        data = record.model_dump(exclude={"extra_data"})
        return cls.model_validate({**data, "metadata": record.extra_data})


class ActivityCursorQuery(BaseRequest):
    categories: list[ActivityCategory] | None = None
    levels: list[ActivityLevel] | None = None
    cursor: UUID | None = None
    size: int = Field(default=20, ge=1, le=100)
