"""RBAC domain events."""

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class RolePermissionsChangedEvent(Event):
    """Fired when a role's permissions are modified. Consumers: cache invalidation."""

    event_name: ClassVar[str] = "role.permissions_changed"
    role_code: str


@dataclass
class RoleDeletedEvent(Event):
    """Fired when a role is deleted. Consumers: remove role from users."""

    event_name: ClassVar[str] = "role.deleted"
    role_code: str
