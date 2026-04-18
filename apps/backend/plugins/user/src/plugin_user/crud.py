"""
用户管理 CRUD 操作。

Author : Coke
Date   : 2026-04-02
"""

from datetime import date, datetime, timedelta

from plugin_auth.auth.models import User
from rapidkit_common.crud import BaseCRUD
from rapidkit_core.timezone import timezone
from sqlmodel import col, func, select


class UserManageCRUD(BaseCRUD[User]):
    """基于 SQLAlchemy 的用户管理 CRUD 操作。"""

    model = User

    async def get_user_count_summary(self) -> dict:
        """获取用户统计摘要：总数、今日新增、昨日新增。"""
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)

        total = await self.get_count()
        today_new = await self.get_count(col(self.model.create_time) >= today_start)
        yesterday_new = await self.get_count(
            col(self.model.create_time) >= yesterday_start,
            col(self.model.create_time) < today_start,
        )

        return {"total": total, "today_new": today_new, "yesterday_new": yesterday_new}

    async def get_user_activity_trend(
        self,
        start: date,
        end: date,
        granularity: str = "day",
    ) -> list[dict]:
        """获取用户注册趋势。"""
        trunc_unit = "hour" if granularity == "hour" else "day"
        end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time())
        start_dt = datetime.combine(start, datetime.min.time())

        bucket = func.date_trunc(trunc_unit, col(self.model.create_time))
        statement = (
            select(bucket.label("time_bucket"), func.count().label("new_users"))
            .where(col(self.model.create_time) >= start_dt, col(self.model.create_time) < end_dt)
            .group_by(bucket)
            .order_by(bucket)
        )

        result = await self.session.exec(statement)
        return [{"time_bucket": row[0], "new_users": row[1]} for row in result.all()]
