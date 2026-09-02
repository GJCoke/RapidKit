"""Explicit projection of selected domain events into dashboard activity."""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from rapidkit_common.events import (
    PluginLoadFailedEvent,
    TaskFailedEvent,
    TaskSucceededEvent,
    UserLoginEvent,
    WorkerOfflineEvent,
)
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import Event
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select

from plugin_system.models import ActivityCategory, ActivityEvent, ActivityLevel
from plugin_system.schemas import ActivityResponse

logger = get_plugin_logger("System")
_sio = None


@dataclass(frozen=True)
class ActivityProjection:
    category: ActivityCategory
    event_code: str
    level: ActivityLevel
    subject_type: str
    source_event_id: str
    occurred_at: datetime
    title_key: str
    title_params: dict
    actor_id: UUID | None = None
    actor_name: str | None = None
    subject_id: str | None = None
    subject_name: str | None = None
    description_key: str | None = None
    description_params: dict = field(default_factory=dict)
    extra_data: dict = field(default_factory=dict)


def _uuid_or_none(value: str | None) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def project_activity(event: Event) -> ActivityProjection:
    """Project only explicitly supported event types; unknown events are rejected."""
    if isinstance(event, UserLoginEvent):
        if event.event_id is None or event.occurred_at is None:
            raise ValueError("UserLoginEvent requires event_id and occurred_at for activity projection")
        return ActivityProjection(
            category=ActivityCategory.USER,
            event_code=event.event_name,
            level=ActivityLevel.INFO,
            actor_id=_uuid_or_none(event.user_id),
            actor_name=event.actor_name,
            subject_type="user",
            subject_id=event.user_id,
            subject_name=event.actor_name,
            title_key="page.home.dashboard.activity.userLogin",
            title_params={"actor": event.actor_name or event.user_id},
            source_event_id=event.event_id,
            occurred_at=event.occurred_at,
        )
    if isinstance(event, TaskSucceededEvent):
        return ActivityProjection(
            category=ActivityCategory.TASK,
            event_code=event.event_name,
            level=ActivityLevel.SUCCESS,
            actor_id=_uuid_or_none(event.actor_id),
            actor_name=event.actor_name,
            subject_type="task",
            subject_id=event.task_id,
            subject_name=event.task_name,
            title_key="page.home.dashboard.activity.taskSucceeded",
            title_params={"task": event.task_name, "duration": event.runtime},
            source_event_id=event.event_id,
            occurred_at=event.occurred_at,
        )
    if isinstance(event, TaskFailedEvent):
        return ActivityProjection(
            category=ActivityCategory.TASK,
            event_code=event.event_name,
            level=ActivityLevel.ERROR,
            actor_id=_uuid_or_none(event.actor_id),
            actor_name=event.actor_name,
            subject_type="task",
            subject_id=event.task_id,
            subject_name=event.task_name,
            title_key="page.home.dashboard.activity.taskFailed",
            title_params={"task": event.task_name},
            description_key="page.home.dashboard.activity.taskFailedDescription",
            description_params={"error": event.error_summary or "-"},
            source_event_id=event.event_id,
            occurred_at=event.occurred_at,
        )
    if isinstance(event, WorkerOfflineEvent):
        return ActivityProjection(
            category=ActivityCategory.SYSTEM,
            event_code=event.event_name,
            level=ActivityLevel.WARNING,
            subject_type="worker",
            subject_id=event.worker_hostname,
            subject_name=event.worker_hostname,
            title_key="page.home.dashboard.activity.workerOffline",
            title_params={"worker": event.worker_hostname},
            source_event_id=event.event_id,
            occurred_at=event.occurred_at,
        )
    if isinstance(event, PluginLoadFailedEvent):
        return ActivityProjection(
            category=ActivityCategory.ALERT,
            event_code=event.event_name,
            level=ActivityLevel.ERROR,
            subject_type="plugin",
            subject_id=event.plugin_name,
            subject_name=event.plugin_name,
            title_key="page.home.dashboard.activity.pluginLoadFailed",
            title_params={"plugin": event.plugin_name},
            description_key="page.home.dashboard.activity.pluginLoadFailedDescription",
            description_params={"error": event.error_summary},
            source_event_id=event.event_id,
            occurred_at=event.occurred_at,
        )
    raise ValueError(f"Unsupported activity event: {type(event).__name__}")


def configure_activity_publisher(sio) -> None:
    """Set the Socket.IO publisher during plugin startup."""
    global _sio  # noqa: PLW0603
    _sio = sio


async def handle_activity_event(event: Event) -> None:
    """Persist one idempotent projection and publish it after commit."""
    projection = project_activity(event)
    async with AsyncSessionLocal() as session:
        existing = await session.exec(
            select(ActivityEvent).where(col(ActivityEvent.source_event_id) == projection.source_event_id)
        )
        if existing.first() is not None:
            return
        record = ActivityEvent(**projection.__dict__)
        session.add(record)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            return
        await session.refresh(record)

    if _sio is not None:
        payload = ActivityResponse.from_record(record).model_dump(by_alias=True, mode="json")
        await _sio.emit("dashboard:activity.created", payload, namespace="/dashboard")
