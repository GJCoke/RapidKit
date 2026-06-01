"""Menu domain events."""

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class MenuChangedEvent(Event):
    """Fired when a menu item is created/updated/deleted. Consumers: audit."""

    event_name: ClassVar[str] = "menu.changed"
    menu_id: str
    action: str  # "created" | "updated" | "deleted"
