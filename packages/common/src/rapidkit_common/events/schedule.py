"""Schedule domain events."""

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class ScheduleCreatedEvent(Event):
    """Fired when a periodic task is created. Consumers: audit."""

    event_name: ClassVar[str] = "schedule.created"
    schedule_id: str
    task_name: str


@dataclass
class ScheduleDeletedEvent(Event):
    """Fired when a periodic task is deleted. Consumers: audit."""

    event_name: ClassVar[str] = "schedule.deleted"
    schedule_id: str
    task_name: str


@dataclass
class ScheduleToggledEvent(Event):
    """Fired when a periodic task is enabled/disabled. Consumers: audit."""

    event_name: ClassVar[str] = "schedule.toggled"
    schedule_id: str
    enabled: bool
