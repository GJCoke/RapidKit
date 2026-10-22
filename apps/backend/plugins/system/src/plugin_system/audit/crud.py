"""Data access for technical audit logs."""

from rapidkit_common.audit import AuditRecord
from rapidkit_common.crud import BaseCRUD
from rapidkit_common.schemas.response import PaginatedResponse
from rapidkit_framework.audit import AuditActorType, AuditResult
from sqlalchemy import func, or_
from sqlalchemy.sql.elements import ClauseList
from sqlmodel import col, select

from plugin_system.audit.models import AuditLog, AuditLogTarget
from plugin_system.audit.schemas import AuditActorOption, AuditLogListItem, AuditLogQuery, AuditTargetResponse


class AuditLogCRUD(BaseCRUD[AuditLog]):
    model = AuditLog

    async def append_batch(self, records: list[AuditRecord]) -> None:
        from plugin_system.audit.writer import AuditWriterImpl

        writer = AuditWriterImpl()
        for record in records:
            await writer.append_in_transaction(self.session, record)

    async def get_audit_page(self, query: AuditLogQuery) -> PaginatedResponse[AuditLogListItem]:
        filters = []
        if query.view == "attention":
            filters.append(col(self.model.result).in_((AuditResult.FAILURE, AuditResult.PARTIAL, AuditResult.UNKNOWN)))
        elif query.view == "system":
            filters.append(self.model.actor_type == AuditActorType.SYSTEM)
        elif query.view == "impersonation":
            filters.append(col(self.model.impersonation_session_id).is_not(None))
        if keyword := (query.keyword or "").strip():
            targets = select(AuditLogTarget.id).where(
                AuditLogTarget.audit_log_id == self.model.id,
                col(AuditLogTarget.resource_name).icontains(keyword, autoescape=True),
            )
            filters.append(
                or_(
                    col(self.model.actor_name).icontains(keyword, autoescape=True),
                    col(self.model.actor_username).icontains(keyword, autoescape=True),
                    col(self.model.resource_name).icontains(keyword, autoescape=True),
                    self.model.extra_data["subject_name"].as_string().icontains(keyword, autoescape=True),
                    self.model.extra_data["subject_username"].as_string().icontains(keyword, autoescape=True),
                    targets.exists(),
                )
            )
        for key in (
            "action",
            "result",
            "actor_id",
            "subject_user_id",
            "impersonation_session_id",
            "resource_type",
            "request_id",
            "correlation_id",
            "risk_level",
            "source",
            "ip",
        ):
            value = getattr(query, key)
            if value is not None:
                filters.append(getattr(self.model, key) == value)
        if query.start_time:
            filters.append(self.model.occurred_at >= query.start_time)
        if query.end_time:
            filters.append(self.model.occurred_at < query.end_time)
        if query.resource_id:
            related = select(AuditLogTarget.id).where(
                AuditLogTarget.audit_log_id == self.model.id, AuditLogTarget.resource_id == query.resource_id
            )
            if query.resource_type:
                related = related.where(AuditLogTarget.resource_type == query.resource_type)
            filters.append(or_(col(self.model.resource_id) == query.resource_id, related.exists()))
        if query.actor_keyword:
            filters.append(
                or_(
                    col(self.model.actor_name).icontains(query.actor_keyword, autoescape=True),
                    col(self.model.actor_username).icontains(query.actor_keyword, autoescape=True),
                )
            )
        if query.resource_keyword:
            filters.append(col(self.model.resource_name).icontains(query.resource_keyword, autoescape=True))
        return await self.get_paginate(
            *filters,
            page=query.page,
            size=query.page_size,
            order_by=ClauseList(col(self.model.occurred_at).desc(), col(self.model.id).desc()),
            schema=AuditLogListItem,
        )

    async def get_actors(
        self, keyword: str | None, limit: int, start_time=None, end_time=None
    ) -> list[AuditActorOption]:
        rank = (
            func.row_number()
            .over(
                partition_by=col(self.model.actor_id),
                order_by=(col(self.model.occurred_at).desc(), col(self.model.id).desc()),
            )
            .label("rank")
        )
        statement = select(self.model.actor_id, self.model.actor_name, self.model.actor_username, rank).where(
            col(self.model.actor_id).is_not(None)
        )
        if start_time:
            statement = statement.where(self.model.occurred_at >= start_time)
        if end_time:
            statement = statement.where(self.model.occurred_at < end_time)
        if keyword:
            statement = statement.where(
                or_(
                    col(self.model.actor_name).icontains(keyword, autoescape=True),
                    col(self.model.actor_username).icontains(keyword, autoescape=True),
                )
            )
        latest = statement.subquery()
        rows = (
            await self.session.exec(
                select(latest.c.actor_id, latest.c.actor_name, latest.c.actor_username)
                .where(latest.c.rank == 1)
                .order_by(latest.c.actor_name, latest.c.actor_id)
                .limit(limit)
            )
        ).all()
        return [AuditActorOption(id=row[0], name=row[1], username=row[2]) for row in rows]

    async def get_targets(self, audit_id, page: int, size: int) -> PaginatedResponse[AuditTargetResponse]:
        await self.get(audit_id, nullable=False)
        crud = AuditTargetCRUD(self.session)
        return await crud.get_paginate(
            col(AuditLogTarget.audit_log_id) == audit_id,
            page=page,
            size=size,
            order_by=col(AuditLogTarget.id),
            schema=AuditTargetResponse,
        )


class AuditTargetCRUD(BaseCRUD[AuditLogTarget]):
    model = AuditLogTarget
