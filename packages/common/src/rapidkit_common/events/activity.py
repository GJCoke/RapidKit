"""Human-readable activity domain event contracts."""

from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class TaskStartedEvent(Event):
    event_name: ClassVar[str] = "task.started"
    event_id: str
    occurred_at: datetime
    task_id: str
    task_name: str
    actor_id: str | None = None
    actor_name: str | None = None
    correlation_id: str | None = None


@dataclass
class TaskSucceededEvent(Event):
    event_name: ClassVar[str] = "task.succeeded"
    event_id: str
    occurred_at: datetime
    task_id: str
    task_name: str
    runtime: float | None
    actor_id: str | None = None
    actor_name: str | None = None
    correlation_id: str | None = None


@dataclass
class TaskFailedEvent(Event):
    event_name: ClassVar[str] = "task.failed"
    event_id: str
    occurred_at: datetime
    task_id: str
    task_name: str
    error_summary: str | None = None
    actor_id: str | None = None
    actor_name: str | None = None
    correlation_id: str | None = None


@dataclass
class TaskCancelledEvent(Event):
    event_name: ClassVar[str] = "task.cancelled"
    event_id: str
    occurred_at: datetime
    task_id: str
    task_name: str
    actor_id: str | None = None
    actor_name: str | None = None
    correlation_id: str | None = None


@dataclass
class WorkerOnlineEvent(Event):
    event_name: ClassVar[str] = "worker.online"
    event_id: str
    occurred_at: datetime
    worker_hostname: str
    correlation_id: str | None = None


@dataclass
class WorkerOfflineEvent(Event):
    event_name: ClassVar[str] = "worker.offline"
    event_id: str
    occurred_at: datetime
    worker_hostname: str
    correlation_id: str | None = None


@dataclass
class SystemStartedEvent(Event):
    event_name: ClassVar[str] = "system.started"
    event_id: str
    occurred_at: datetime
    instance_name: str
    correlation_id: str | None = None


@dataclass
class PluginLoadFailedEvent(Event):
    event_name: ClassVar[str] = "alert.plugin_load_failed"
    event_id: str
    occurred_at: datetime
    plugin_name: str
    error_summary: str
    correlation_id: str | None = None


@dataclass
class TaskRepeatedFailureAlertEvent(Event):
    event_name: ClassVar[str] = "alert.task_repeated_failure"
    event_id: str
    occurred_at: datetime
    task_id: str
    task_name: str
    failure_count: int
    correlation_id: str | None = None
