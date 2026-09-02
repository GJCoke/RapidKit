"""Plugin-neutral contracts for the operations dashboard."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol


@dataclass(frozen=True, slots=True)
class ServerSnapshot:
    healthy: int
    total: int


@dataclass(frozen=True, slots=True)
class DayComparison:
    today: int
    yesterday: int


@dataclass(frozen=True, slots=True)
class ApiErrorComparison:
    today_rate: float | None
    yesterday_rate: float | None


@dataclass(frozen=True, slots=True)
class OperationsTrendPoint:
    date: str
    request_count: int
    avg_response_ms: float | None


@dataclass(frozen=True, slots=True)
class QueueSnapshot:
    current_depth: int
    yesterday_depth: int | None


@dataclass(frozen=True, slots=True)
class TaskSuccessComparison:
    current_rate: float | None
    previous_rate: float | None


@dataclass(frozen=True, slots=True)
class SyncSnapshot:
    last_sync_at: datetime | None
    status: Literal["healthy", "delayed", "failed"]


class UserOperationsProvider(Protocol):
    async def get_active_users(self, today_start: datetime, tomorrow_start: datetime) -> DayComparison: ...


class WorkerOperationsProvider(Protocol):
    async def get_server_snapshot(self, now: datetime) -> ServerSnapshot: ...

    async def get_task_comparison(self, today_start: datetime, tomorrow_start: datetime) -> DayComparison: ...

    async def get_queue_snapshot(self, now: datetime) -> QueueSnapshot: ...

    async def get_task_success_comparison(
        self,
        current_start: datetime,
        current_end: datetime,
        previous_start: datetime,
    ) -> TaskSuccessComparison: ...


class MonitoringOperationsProvider(Protocol):
    async def get_api_error_comparison(
        self,
        today_start: datetime,
        tomorrow_start: datetime,
    ) -> ApiErrorComparison: ...

    async def get_trend(self, start: datetime, end: datetime) -> list[OperationsTrendPoint]: ...

    async def get_sync_snapshot(self, now: datetime) -> SyncSnapshot: ...
