"""Operations dashboard domain events."""

from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class UserActivityObservedEvent(Event):
    """Fired after an authenticated request resolves an enabled user."""

    event_name: ClassVar[str] = "user.activity_observed"
    user_id: str
    occurred_at: datetime
