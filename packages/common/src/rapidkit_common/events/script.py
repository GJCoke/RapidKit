"""Script domain events."""

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class ScriptExecutedEvent(Event):
    """Fired when a script is executed. Consumers: audit."""

    event_name: ClassVar[str] = "script.executed"
    script_id: str
    executor_id: str
