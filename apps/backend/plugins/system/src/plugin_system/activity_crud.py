"""Data access for curated dashboard activity."""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import CursorPaginatedResponse
from sqlmodel import col, select

from plugin_system.models import ActivityCategory, ActivityEvent, ActivityLevel
from plugin_system.schemas import ActivityResponse


class ActivityEventCRUD(BaseCRUD[ActivityEvent]):
    model = ActivityEvent

    async def get_cursor_page(
        self,
        *,
        categories: list[ActivityCategory] | None = None,
        levels: list[ActivityLevel] | None = None,
        cursor: UUID | None = None,
        size: int = 20,
    ) -> CursorPaginatedResponse[ActivityResponse]:
        filters = []
        if categories:
            filters.append(col(self.model.category).in_(categories))
        if levels:
            filters.append(col(self.model.level).in_(levels))
        if cursor:
            filters.append(col(self.model.id) < cursor)
        statement = select(self.model).where(*filters).order_by(col(self.model.id).desc()).limit(size + 1)
        records = list((await self.session.exec(statement)).all())
        has_next = len(records) > size
        records = records[:size]
        return CursorPaginatedResponse(
            items=[ActivityResponse.from_record(record) for record in records],
            next_cursor=records[-1].id if has_next and records else None,
            size=size,
        )
