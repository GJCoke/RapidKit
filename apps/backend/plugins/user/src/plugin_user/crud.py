"""
用户管理 CRUD 操作。

Author : Coke
Date   : 2026-04-02
"""

from datetime import date, datetime, timedelta

from rapidkit_common.crud import BaseCRUD
from rapidkit_core.timezone import timezone
from sqlalchemy import ColumnElement
from sqlmodel import col, func, select

from plugin_user.models import User
from plugin_user.schemas import UserDepartmentCounts


class UserManageCRUD(BaseCRUD[User]):
    """基于 SQLAlchemy 的用户管理 CRUD 操作。"""

    model = User

    async def get_department_counts(self) -> UserDepartmentCounts:
        """计数与用户列表共享请求会话的数据范围。"""
        statement = select(User.department_id, func.count(col(User.id))).group_by(col(User.department_id))
        rows = (await self.session.exec(statement)).all()
        return UserDepartmentCounts(
            total=sum(count for _, count in rows),
            unassigned=next((count for department, count in rows if department is None), 0),
            departments={str(department): count for department, count in rows if department is not None},
        )

    async def get_user_count_summary(self, *filters: ColumnElement[bool]) -> dict:
        """获取用户统计摘要：总数、今日新增、昨日新增。"""
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)

        total = await self.get_count(*filters)
        today_new = await self.get_count(*filters, col(self.model.create_time) >= today_start)
        yesterday_new = await self.get_count(
            *filters,
            col(self.model.create_time) >= yesterday_start,
            col(self.model.create_time) < today_start,
        )

        return {"total": total, "today_new": today_new, "yesterday_new": yesterday_new}

    async def get_user_activity_trend(
        self,
        start: date,
        end: date,
        granularity: str = "day",
        *filters: ColumnElement[bool],
    ) -> list[dict]:
        """获取用户注册趋势。"""
        trunc_unit = "hour" if granularity == "hour" else "day"
        end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time())
        start_dt = datetime.combine(start, datetime.min.time())

        bucket = func.date_trunc(trunc_unit, col(self.model.create_time))
        statement = (
            select(bucket.label("time_bucket"), func.count().label("new_users"))
            .where(col(self.model.create_time) >= start_dt, col(self.model.create_time) < end_dt, *filters)
            .group_by(bucket)
            .order_by(bucket)
        )

        result = await self.session.exec(statement)
        return [{"time_bucket": row[0], "new_users": row[1]} for row in result.all()]
