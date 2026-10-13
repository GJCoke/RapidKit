"""Celery Solar with a compatible polar-day retry.

Author : Coke
Date   : 2026-10-08
"""

from datetime import UTC, datetime, timedelta

from celery.schedules import solar


class Solar(solar):
    """Keep Celery's event definition, fixing ephem.Date + timedelta on polar days."""

    def next_event(self, after: datetime) -> datetime:
        after = self.maybe_make_aware(after).astimezone(UTC)
        self.cal.date = after
        kwargs: dict[str, datetime | bool] = {"start": after}
        if self.use_center:
            kwargs["use_center"] = True
        date = getattr(self.cal, self.method)(self.ephem.Sun(), **kwargs)
        return date.datetime().replace(tzinfo=UTC)

    def remaining_estimate(self, last_run_at: datetime) -> timedelta:
        now = self.maybe_make_aware(self.now()).astimezone(UTC)
        # last_run_at does not advance on skipped polar days. Look for an actual
        # event in the last day so returning sunlight can resume the schedule.
        cursor = max(self.maybe_make_aware(last_run_at).astimezone(UTC), now - timedelta(days=1))
        while True:
            try:
                return self.next_event(cursor) - now
            except self.ephem.CircumpolarError:
                if cursor >= now:
                    break
                cursor = min(cursor + timedelta(hours=6), now)
        # Anchor retries to NOW: a retry relative to an old last_run_at can be
        # overdue and make Celery dispatch a task for a nonexistent solar event.
        self.cal.date = now
        retry = self.cal.next_antitransit(self.ephem.Sun()).datetime().replace(tzinfo=UTC)
        return retry + timedelta(minutes=1) - now
