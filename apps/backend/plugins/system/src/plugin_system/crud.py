"""
系统领域 CRUD 操作。

Author : Coke
Date   : 2026-04-10
"""

from rapidkit_common.crud import BaseCRUD
from sqlmodel import col, select

from plugin_system.models import ActivityLog


class ActivityLogCRUD(BaseCRUD[ActivityLog]):
    """活动日志 CRUD。"""

    model = ActivityLog

    async def get_recent(self, limit: int = 15) -> list[ActivityLog]:
        """获取最近的活动日志。"""
        statement = select(self.model).order_by(col(self.model.create_time).desc()).limit(limit)
        result = await self.session.exec(statement)
        return list(result.all())
