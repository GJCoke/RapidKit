"""Bounded future execution previews using Celery's own Cron implementation."""

from calendar import monthrange
from datetime import UTC, datetime

from celery.schedules import crontab
from pydantic.alias_generators import to_camel
from rapidkit_core.timezone import timezone

from plugin_schedule.schemas import CrontabPreviewRequest, CrontabPreviewResponse


def preview_crontab(body: CrontabPreviewRequest, *, start: datetime | None = None) -> CrontabPreviewResponse:
    """Preview five future runs within five years, without a broker or database.

    Celery owns both field parsing and date/weekday intersection semantics.
    UTC arithmetic preserves its real-time estimates across DST transitions.
    ``start`` is injectable for deterministic callers and tests.
    """
    cursor = timezone.to_local(start) if start is not None else timezone.now_local()
    result = CrontabPreviewResponse(valid=True, timezone=timezone.tz_info.key, evaluated_at=cursor)
    fields = body.model_dump()
    for field, value in fields.items():
        try:
            if not value.strip():
                raise ValueError("empty Cron field")
            crontab(**{field: value})
        except ValueError, KeyError, TypeError, ZeroDivisionError:
            return result.model_copy(update={"valid": False, "error_field": to_camel(field)})

    schedule = crontab(**fields, nowfun=lambda: cursor)
    horizon_year = cursor.year + result.horizon_years
    horizon = cursor.replace(
        year=horizon_year, day=min(cursor.day, monthrange(horizon_year, cursor.month)[1])
    ).astimezone(UTC)
    for _ in range(5):
        try:
            delta = schedule.remaining_estimate(cursor)
            candidate = (cursor.astimezone(UTC) + delta).astimezone(timezone.tz_info)
        except RuntimeError, ValueError, OverflowError:
            # Celery bounds impossible date rollovers (e.g. February 31).
            break
        if candidate.astimezone(UTC) <= cursor.astimezone(UTC) or candidate.astimezone(UTC) > horizon:
            break
        result.next_runs.append(candidate)
        cursor = candidate
    return result
