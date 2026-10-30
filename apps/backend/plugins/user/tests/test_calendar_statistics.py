from datetime import UTC, date, datetime, timedelta

import plugin_user.crud as module
import pytest
import pytest_asyncio
from plugin_user.crud import UserManageCRUD
from plugin_user.models import User
from plugin_user.schemas import UserActivityTrend
from rapidkit_core.timezone import TimeZone
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture
async def calendar_session(pg_engine):
    async with pg_engine.begin() as conn:
        await conn.run_sync(lambda sync: User.__table__.create(sync))
    async with AsyncSession(pg_engine, expire_on_commit=False) as session:
        yield session
    async with pg_engine.begin() as conn:
        await conn.run_sync(lambda sync: User.__table__.drop(sync))


@pytest.mark.parametrize(
    "zone,day,hour",
    [
        ("Asia/Shanghai", date(2026, 10, 29), 1),
        ("Asia/Shanghai", date(2026, 10, 29), 16),
        ("Europe/Berlin", date(2026, 3, 30), 1),
        ("America/New_York", date(2026, 11, 2), 1),
    ],
)
async def test_summary_and_daily_trend_use_calendar_boundaries(calendar_session, monkeypatch, zone, day, hour):
    clock = TimeZone(zone)
    now = datetime.combine(day, datetime.min.time(), tzinfo=clock.tz_info) + timedelta(hours=hour)
    clock.now = lambda: now.astimezone(UTC).replace(tzinfo=None)
    clock.now_local = lambda: now
    monkeypatch.setattr(module, "timezone", clock)
    today, tomorrow = clock.start_of_day(day), clock.start_of_day(day + timedelta(days=1))
    yesterday = clock.start_of_day(day - timedelta(days=1))
    for index, created in enumerate(
        [
            yesterday - timedelta(seconds=1),
            yesterday,
            today - timedelta(seconds=1),
            today,
            tomorrow - timedelta(seconds=1),
            tomorrow,
        ]
    ):
        calendar_session.add(
            User(
                name=f"User {index}",
                username=f"user-{index}",
                email=f"user{index}@example.com",
                password=b"x",
                create_time=created,
            )
        )
    await calendar_session.commit()
    crud = UserManageCRUD(calendar_session)
    assert await crud.get_user_count_summary() == {"total": 6, "today_new": 2, "yesterday_new": 2}
    trend = await crud.get_user_activity_trend(day, day + timedelta(days=1))
    payload = [UserActivityTrend(**row).model_dump(mode="json", by_alias=True) for row in trend]
    assert payload == [
        {"timeBucket": day.isoformat(), "newUsers": 2},
        {"timeBucket": (day + timedelta(days=1)).isoformat(), "newUsers": 1},
    ]


async def test_hourly_trend_preserves_repeated_dst_hour(calendar_session, monkeypatch):
    monkeypatch.setattr(module, "timezone", TimeZone("Europe/Berlin"))
    for index, created in enumerate([datetime(2026, 10, 25, 0, 30), datetime(2026, 10, 25, 1, 30)]):
        calendar_session.add(
            User(
                name=f"User {index}",
                username=f"user-{index}",
                email=f"user{index}@example.com",
                password=b"x",
                create_time=created,
            )
        )
    await calendar_session.commit()
    trend = await UserManageCRUD(calendar_session).get_user_activity_trend(
        date(2026, 10, 25), date(2026, 10, 25), "hour"
    )
    payload = [UserActivityTrend(**row).model_dump(mode="json", by_alias=True) for row in trend]
    assert len(payload) == 2
    assert all(datetime.fromisoformat(row["timeBucket"]).tzinfo is not None for row in payload)
    assert [datetime.fromisoformat(row["timeBucket"]).astimezone(UTC).hour for row in payload] == [0, 1]
