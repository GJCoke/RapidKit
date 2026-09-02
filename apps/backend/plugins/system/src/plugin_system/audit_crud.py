"""Data access for technical audit logs."""

from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from sqlmodel import col

from plugin_system.models import AuditLog
from plugin_system.schemas import AuditLogListItem, AuditLogQuery


class AuditLogCRUD(BaseCRUD[AuditLog]):
    model = AuditLog

    async def get_audit_page(self, query: AuditLogQuery) -> PaginatedResponse[AuditLogListItem]:
        filters = []
        if query.action:
            filters.append(col(self.model.action) == query.action)
        if query.result:
            filters.append(col(self.model.result) == query.result)
        if query.actor_id:
            filters.append(col(self.model.actor_id) == query.actor_id)
        return await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=col(self.model.occurred_at).desc(),
            schema=AuditLogListItem,
        )
