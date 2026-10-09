"""Authoritative previews for all three schedule types, without a broker or DB.

Author : Coke
Date   : 2026-10-08
"""

from calendar import monthrange
from datetime import UTC, datetime, timedelta

from rapidkit_core.timezone import timezone

from plugin_schedule.cron_preview import preview_crontab
from plugin_schedule.schemas import CrontabPreviewRequest, SchedulePreviewRequest, SchedulePreviewResponse
from plugin_schedule.solar import Solar


def preview_schedule(body: SchedulePreviewRequest, *, start: datetime | None = None) -> SchedulePreviewResponse:
    cursor = timezone.to_local(start) if start is not None else timezone.now_local()
    definition = body.schedule
    if definition.type == "crontab":
        cron = preview_crontab(CrontabPreviewRequest(**definition.model_dump(exclude={"type"})), start=cursor)
        return SchedulePreviewResponse(**cron.model_dump())
    result = SchedulePreviewResponse(valid=True, timezone=timezone.tz_info.key, evaluated_at=cursor)
    cursor = cursor.astimezone(UTC)
    year = cursor.year + result.horizon_years
    horizon = cursor.replace(year=year, day=min(cursor.day, monthrange(year, cursor.month)[1]))
    if definition.type == "interval":
        delta = timedelta(**{definition.period.value: definition.every})
        for _ in range(5):
            try:
                cursor += delta
            except OverflowError:
                break
            if cursor > horizon:
                break
            result.next_runs.append(cursor.astimezone(timezone.tz_info))
        return result
    schedule = Solar(definition.event.value, definition.latitude, definition.longitude)
    # Daily search is bounded; polar retry timestamps must never appear as runs.
    while cursor < horizon and len(result.next_runs) < 5:
        try:
            event = schedule.next_event(cursor)
        except schedule.ephem.CircumpolarError:
            cursor += timedelta(days=1)
            continue
        if event <= cursor or event > horizon:
            break
        result.next_runs.append(event.astimezone(timezone.tz_info))
        # Avoid floating-point rounding finding the same transit twice.
        cursor = event + timedelta(seconds=1)
    return result
