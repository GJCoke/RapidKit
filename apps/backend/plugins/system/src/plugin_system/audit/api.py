from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.config import settings
from rapidkit_framework.i18n import t

from plugin_system.audit.deps import AuditLogCrudDep
from plugin_system.audit.schemas import (
    AuditActorOption,
    AuditCatalogAction,
    AuditCatalogResponse,
    AuditLogDetail,
    AuditLogListItem,
    AuditLogQuery,
    AuditTargetResponse,
)

router = APIRouter(
    prefix="/system",
    tags=["System"],
)


@router.get("/audit-logs/paginate", summary="审计日志分页查询", dependencies=[Require("audit-log:read")])
async def get_audit_logs(
    query: Annotated[AuditLogQuery, Query(...)],
    crud: AuditLogCrudDep,
) -> Response[PaginatedResponse[AuditLogListItem]]:
    """分页查询审计日志，支持按查询条件筛选。"""
    return Response(data=await crud.get_audit_page(query))


@router.get("/audit-logs/catalog", dependencies=[Require("audit-log:read")])
async def get_audit_catalog(request: Request) -> Response[AuditCatalogResponse]:
    from plugin_system.audit.catalog import build_audit_catalog

    actions = build_audit_catalog(getattr(request.app.state, "plugins", []))
    return Response(
        data=AuditCatalogResponse(
            timezone=settings.DATETIME_TIMEZONE,
            actions=[
                AuditCatalogAction(
                    code=action.code,
                    label=t(action.label_key),
                    resource_type=action.resource_type,
                    resource_label=t(action.resource_label_key),
                    risk_level=action.risk_level,
                    fields={key: t(value) for key, value in action.fields.items()},
                )
                for action in actions.values()
            ],
        )
    )


@router.get("/audit-logs/actors", dependencies=[Require("audit-log:read")])
async def get_audit_actors(
    crud: AuditLogCrudDep,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    start_time: Annotated[datetime | None, Query(alias="startTime")] = None,
    end_time: Annotated[datetime | None, Query(alias="endTime")] = None,
) -> Response[list[AuditActorOption]]:
    query = AuditLogQuery(start_time=start_time, end_time=end_time)
    return Response(data=await crud.get_actors(keyword, limit, query.start_time, query.end_time))


@router.get("/audit-logs/{item_id}/targets", dependencies=[Require("audit-log:read")])
async def get_audit_targets(
    item_id: UUID,
    crud: AuditLogCrudDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> Response[PaginatedResponse[AuditTargetResponse]]:
    return Response(data=await crud.get_targets(item_id, page, page_size))


@router.get("/audit-logs/{item_id}", summary="审计日志详情", dependencies=[Require("audit-log:read")])
async def get_audit_log_detail(item_id: UUID, crud: AuditLogCrudDep) -> Response[AuditLogDetail | None]:
    """获取单条审计日志及其关联对象信息，不存在时返回空。"""
    record = await crud.get(item_id)
    return Response(data=AuditLogDetail.model_validate(record) if record else None)
