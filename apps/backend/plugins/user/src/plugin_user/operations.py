"""Operations dashboard data provided by the user plugin."""

from datetime import date, datetime, timedelta
from uuid import UUID

from rapidkit_common.events import UserActivityObservedEvent
from rapidkit_common.protocols.operations import DayComparison
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.timezone import TimeZone, timezone
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col, func, select

from plugin_user.models import UserDailyActivity


def activity_date_for(occurred_at: datetime, clock: TimeZone = timezone) -> date:
    """Convert a stored UTC timestamp to the configured local calendar date."""

    return clock.to_local(occurred_at).date()


class UserOperationsProviderImpl:
    def __init__(self, session_factory=AsyncSessionLocal):
        self._session_factory = session_factory

    async def get_active_users(self, today_start: datetime, tomorrow_start: datetime) -> DayComparison:
        async with self._session_factory() as session:
            today_date = activity_date_for(today_start)
            tomorrow_date = activity_date_for(tomorrow_start)
            yesterday_date = today_date - timedelta(days=1)
            statement = select(
                func.count().filter(
                    col(UserDailyActivity.activity_date) >= today_date,
                    col(UserDailyActivity.activity_date) < tomorrow_date,
                ),
                func.count().filter(
                    col(UserDailyActivity.activity_date) >= yesterday_date,
                    col(UserDailyActivity.activity_date) < today_date,
                ),
            )
            today, yesterday = (await session.exec(statement)).one()
        return DayComparison(today=int(today or 0), yesterday=int(yesterday or 0))


async def record_user_activity(event: UserActivityObservedEvent) -> None:
    """Persist one activity fact per user and local day."""

    activity_date = activity_date_for(event.occurred_at)
    statement = (
        insert(UserDailyActivity)
        .values(user_id=UUID(event.user_id), activity_date=activity_date)
        .on_conflict_do_nothing(index_elements=["activity_date", "user_id"])
    )
    async with AsyncSessionLocal() as session:
        await session.exec(statement)
        await session.commit()
