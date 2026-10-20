"""ISO instant types; ordinary display timestamps continue to use LocalDatetime."""

from datetime import UTC, datetime
from typing import Annotated

import rapidkit_core.timezone as timezones
from pydantic import PlainSerializer


def serialize_utc_instant(value: datetime) -> str:
    """Serialize the existing naive UTC banner timestamps with an explicit offset."""
    return value.replace(tzinfo=UTC).isoformat()


def serialize_editable_instant(value: datetime) -> str:
    """Preserve the instant when an editor uses a different browser timezone."""
    return timezones.timezone.to_local(value).isoformat()


UTCInstant = Annotated[datetime, PlainSerializer(serialize_utc_instant, return_type=str)]
EditableInstant = Annotated[datetime, PlainSerializer(serialize_editable_instant, return_type=str)]
