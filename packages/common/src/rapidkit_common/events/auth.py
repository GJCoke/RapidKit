"""Auth domain events."""

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class UserLoginEvent(Event):
    """Fired when a user logs in. Consumers: audit."""

    event_name: ClassVar[str] = "user.login"
    user_id: str


@dataclass
class UserLogoutEvent(Event):
    """Fired when a user logs out. Consumers: audit."""

    event_name: ClassVar[str] = "user.logout"
    user_id: str
