"""Authoritative Cron previews, without database or broker access."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_schedule.api import router
from plugin_schedule.cron_preview import preview_crontab
from plugin_schedule.schemas import CrontabPreviewRequest
from pydantic.alias_generators import to_camel
from rapidkit_common.auth import verify_user_permission
from rapidkit_core.timezone import timezone


def preview(start: str = "2026-10-08T09:30:00+08:00", **fields):
    return preview_crontab(CrontabPreviewRequest(**fields), start=datetime.fromisoformat(start))


def test_strictly_future_and_weekday_ranges():
    result = preview(minute="30", hour="9", day_of_week="mon-fri")
    assert result.valid
    assert [dt.day for dt in result.next_runs] == [9, 12, 13, 14, 15]
    assert all((dt.hour, dt.minute) == (9, 30) for dt in result.next_runs)
    assert result.timezone == "Asia/Shanghai"
    assert result.model_dump(mode="json", by_alias=True)["nextRuns"][0] == "2026-10-09 09:30:00"


def test_steps_start_at_clock_boundary_not_elapsed_interval():
    result = preview(start="2026-10-08T09:58:23+08:00", minute="*/15")
    assert [(dt.hour, dt.minute) for dt in result.next_runs] == [(10, 0), (10, 15), (10, 30), (10, 45), (11, 0)]


def test_monthly_skips_nonexistent_dates():
    result = preview(minute="0", hour="0", day_of_month="31")
    assert [dt.month for dt in result.next_runs] == [10, 12, 1, 3, 5]


def test_sunday_zero_and_celery_date_weekday_intersection():
    result = preview(minute="0", hour="0", day_of_month="1", day_of_week="0")
    assert all(dt.day == 1 and dt.isoweekday() == 7 for dt in result.next_runs)
    assert result.next_runs[0].date().isoformat() == "2026-11-01"


def test_impossible_dates_are_bounded_and_leap_dates_still_work():
    assert preview(day_of_month="31", month_of_year="2").next_runs == []
    result = preview(minute="0", hour="0", day_of_month="29", month_of_year="2")
    assert [dt.year for dt in result.next_runs] == [2028]
    assert result.horizon_years == 5


@pytest.mark.parametrize(
    "field,value",
    [
        ("minute", "60"),
        ("hour", "24"),
        ("day_of_week", "7"),
        ("month_of_year", "0"),
        ("day_of_month", "0"),
        ("minute", "*/0"),
        ("minute", ""),
        ("hour", "garbage"),
    ],
)
def test_invalid_fields_have_structured_errors(field, value):
    result = preview(**{field: value})
    assert not result.valid
    assert result.error_field == to_camel(field)
    assert result.next_runs == []


def test_dst_arithmetic_matches_celery_real_time_estimate(monkeypatch):
    zone = ZoneInfo("Europe/Berlin")
    monkeypatch.setattr(timezone, "tz_info", zone)
    result = preview(start="2026-03-28T23:00:00+01:00", minute="30", hour="2")
    assert result.timezone == "Europe/Berlin"
    assert result.next_runs[0].astimezone(UTC).isoformat() == "2026-03-29T01:30:00+00:00"
    assert result.next_runs[0].hour == 3
    assert result.next_runs[1].hour == 2


@pytest.mark.asyncio
async def test_preview_route_uses_camel_case_and_needs_no_database():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[verify_user_permission] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/schedules/crontab/preview", json={"minute": "0", "dayOfWeek": "0"})
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["valid"] and len(data["nextRuns"]) == 5
        bad = await client.post("/schedules/crontab/preview", json={"dayOfWeek": "7"})
        assert bad.json()["data"]["errorField"] == "dayOfWeek"
        long = await client.post("/schedules/crontab/preview", json={"minute": "1" * 129})
        assert long.status_code == 422
