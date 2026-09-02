"""Auth domain events."""

from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class UserLoginEvent(Event):
    """Fired when a user logs in. Consumers: audit."""

    event_name: ClassVar[str] = "user.login"
    user_id: str
    event_id: str | None = None
    occurred_at: datetime | None = None
    actor_name: str | None = None
    correlation_id: str | None = None


@dataclass
class UserLogoutEvent(Event):
    """Fired when a user logs out. Consumers: audit."""

    event_name: ClassVar[str] = "user.logout"
    user_id: str
    event_id: str | None = None
    occurred_at: datetime | None = None
    actor_name: str | None = None
    correlation_id: str | None = None
