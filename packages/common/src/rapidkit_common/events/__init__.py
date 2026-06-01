"""Cross-plugin event definitions — shared contracts for EventBus communication."""

from rapidkit_common.events.auth import UserLoginEvent, UserLogoutEvent
from rapidkit_common.events.department import DepartmentDeletedEvent
from rapidkit_common.events.menu import MenuChangedEvent
from rapidkit_common.events.rbac import RoleDeletedEvent, RolePermissionsChangedEvent
from rapidkit_common.events.schedule import (
    ScheduleCreatedEvent,
    ScheduleDeletedEvent,
    ScheduleToggledEvent,
)
from rapidkit_common.events.script import ScriptExecutedEvent
from rapidkit_common.events.user import (
    UserCreatedEvent,
    UserDeletedEvent,
    UserPasswordChangedEvent,
    UserRolesChangedEvent,
)

__all__ = [
    "DepartmentDeletedEvent",
    "MenuChangedEvent",
    "RoleDeletedEvent",
    "RolePermissionsChangedEvent",
    "ScheduleCreatedEvent",
    "ScheduleDeletedEvent",
    "ScheduleToggledEvent",
    "ScriptExecutedEvent",
    "UserCreatedEvent",
    "UserDeletedEvent",
    "UserLoginEvent",
    "UserLogoutEvent",
    "UserPasswordChangedEvent",
    "UserRolesChangedEvent",
]
