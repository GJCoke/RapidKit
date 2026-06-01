"""Department domain events."""

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class DepartmentDeletedEvent(Event):
    """Fired when a department is deleted. Consumers should clear references."""

    event_name: ClassVar[str] = "department.deleted"
    department_id: str
