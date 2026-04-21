"""
活动日志 CRUD。

Author : Coke
Date   : 2026-04-10
"""

from datetime import datetime
from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from sqlmodel import col, select

from plugin_system.models import ActivityLog
from plugin_system.schemas import ActivityResponse


class ActivityLogCRUD(BaseCRUD[ActivityLog]):
    """活动日志数据操作。"""

    model = ActivityLog

    async def get_recent(self, limit: int = 15) -> list[ActivityLog]:
        """获取最近的活动日志。"""
        statement = select(self.model).order_by(col(self.model.create_time).desc()).limit(limit)
        result = await self.session.exec(statement)
        return list(result.all())

    async def get_paginated(
        self,
        *,
        event_type: str | None = None,
        user_id: UUID | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        size: int = 20,
    ) -> PaginatedResponse[ActivityResponse]:
        """分页查询活动日志，支持多条件过滤。"""
        filters = []
        if event_type:
            filters.append(col(self.model.event_type) == event_type)
        if user_id:
            filters.append(col(self.model.user_id) == user_id)
        if start_time:
            filters.append(col(self.model.create_time) >= start_time)
        if end_time:
            filters.append(col(self.model.create_time) <= end_time)
        return await self.get_paginate(
            *filters,
            page=page,
            size=size,
            order_by=col(self.model.create_time).desc(),
            schema=ActivityResponse,
        )
