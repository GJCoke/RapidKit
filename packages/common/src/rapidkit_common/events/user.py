"""User domain events."""

from dataclasses import dataclass, field
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class UserCreatedEvent(Event):
    """Fired when a user is created. Consumers: audit."""

    event_name: ClassVar[str] = "user.created"
    user_id: str


@dataclass
class UserDeletedEvent(Event):
    """Fired when a user is deleted. Consumers should clean up references."""

    event_name: ClassVar[str] = "user.deleted"
    user_id: str


@dataclass
class UserRolesChangedEvent(Event):
    """Fired when a user's role assignment changes. Consumers: cache invalidation."""

    event_name: ClassVar[str] = "user.roles_changed"
    user_id: str
    role_codes: list[str] = field(default_factory=list)


@dataclass
class UserPasswordChangedEvent(Event):
    """Fired when a user changes password. Consumers: audit."""

    event_name: ClassVar[str] = "user.password_changed"
    user_id: str
