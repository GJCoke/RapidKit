"""
系统统计 API 路由。

Author : Coke
Date   : 2026-04-10
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.config import settings
from rapidkit_framework.events import event_bus
from rapidkit_framework.plugin import PluginMeta

from plugin_system.deps import ActivityLogCrudDep
from plugin_system.health import check_minio, check_pg, check_redis
from plugin_system.push import _RESOURCE_KEY_PREFIX
from plugin_system.schemas import (
    ActivityPaginatedQuery,
    ActivityResponse,
    AggregatedHealth,
    BusinessSummary,
    DeadLetterResponse,
    ErrorStats,
    EventBusStats,
    HealthStats,
    InfrastructureHealth,
    InstanceResourceStats,
    MultiResourceStats,
    PluginDependencyGraph,
    PluginEdge,
    PluginErrorResponse,
    PluginNode,
    PluginStatusItem,
)
from plugin_system.services import (
    aggregate_instances,
    build_business_summary,
    build_plugin_dependency_graph,
    build_plugin_status_list,
    derive_overall_health,
    empty_instance,
    get_error_counts,
    get_error_sparkline_24h,
    get_qps,
    get_response_time_percentiles,
    get_total_requests,
    parse_instance,
)

router = APIRouter(
    prefix="/system",
    tags=["System"],
    dependencies=[Depends(verify_user_permission)],
)


def _plugin_status_to_schema(d: dict) -> dict:
    """Convert a service-layer plugin status dict for PluginStatusItem construction."""
    d = dict(d)
    if d.get("error") is not None:
        d["error"] = PluginErrorResponse(**d["error"])
    return d


@router.get("/stats/resources", summary="服务器资源统计")
async def get_resource_stats(
    redis: RedisDep,
    instance: str | None = Query(None, description="实例 hostname，不传返回所有实例 + 汇总"),
) -> Response[MultiResourceStats]:
    """获取服务器资源，支持多实例汇总和按实例查询。"""

    if instance:
        data = await redis.hgetall(f"{_RESOURCE_KEY_PREFIX}{instance}")
        if not data:
            parsed = empty_instance(instance)
        else:
            parsed = parse_instance(data)
        return Response(data=MultiResourceStats(instances=[parsed], summary=parsed))

    instances: list[InstanceResourceStats] = []
    cursor: int = 0
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"{_RESOURCE_KEY_PREFIX}*", count=100)
        for key in keys:
            data = await redis.hgetall(key)
            if data:
                instances.append(parse_instance(data))
        if cursor == 0:
            break

    summary = aggregate_instances(instances)
    return Response(data=MultiResourceStats(instances=instances, summary=summary))


@router.get("/stats/errors", summary="错误统计")
async def get_error_stats(redis: RedisDep) -> Response[ErrorStats]:
    """获取 HTTP 5xx 和业务异常统计。"""
    http_5xx, biz_errors = await get_error_counts(redis, hours=1)
    total_requests = await get_total_requests(redis, hours=1)
    sparkline = await get_error_sparkline_24h(redis)

    error_rate = 0.0
    if total_requests > 0:
        error_rate = round((http_5xx + biz_errors) / total_requests * 100, 2)

    return Response(
        data=ErrorStats(
            http_5xx_count=http_5xx,
            biz_error_count=biz_errors,
            total_requests=total_requests,
            error_rate=error_rate,
            sparkline_24h=sparkline,
        )
    )


@router.get("/stats/health", summary="应用健康统计")
async def get_health_stats(request: Request, redis: RedisDep) -> Response[HealthStats]:
    """获取 QPS、响应时间 P50/P95 和错误计数。"""
    qps = await get_qps(redis)
    p50, p95 = await get_response_time_percentiles(redis)
    http_5xx, biz_errors = await get_error_counts(redis, hours=1)

    try:
        socket = request.app.state.socket
        rooms = socket.manager.rooms.get("/", {})
        ws_connections = len(rooms.get(None, set()))
    except AttributeError:
        ws_connections = 0

    return Response(
        data=HealthStats(
            qps=qps,
            p50_ms=p50,
            p95_ms=p95,
            http_5xx_1h=http_5xx,
            biz_errors_1h=biz_errors,
            ws_connections=ws_connections,
        )
    )


@router.get("/stats/infrastructure", summary="基础设施健康状态")
async def get_infrastructure_health(session: SessionDep, redis: RedisDep) -> Response[InfrastructureHealth]:
    """检查 PostgreSQL、Redis、MinIO 的健康状态。"""
    pg_health = await check_pg(session)
    redis_health = await check_redis(redis)
    minio_health = check_minio()

    return Response(data=InfrastructureHealth(pg=pg_health, redis=redis_health, minio=minio_health))


@router.get("/health", summary="聚合健康状态")
async def get_aggregated_health(
    session: SessionDep,
    redis: RedisDep,
) -> Response[AggregatedHealth]:
    """聚合基础设施健康状态。"""
    pg_health = await check_pg(session)
    redis_health = await check_redis(redis)
    minio_health = check_minio()
    infra = InfrastructureHealth(pg=pg_health, redis=redis_health, minio=minio_health)

    overall = derive_overall_health([svc.status for svc in (infra.pg, infra.redis, infra.minio)])
    return Response(data=AggregatedHealth(status=overall, infrastructure=infra))


@router.get("/stats/business", summary="业务数据汇总")
async def get_business_summary(session: SessionDep) -> Response[BusinessSummary]:
    """获取各业务模块的数据总量。"""
    summary = await build_business_summary(session, enable_celery=settings.ENABLE_CELERY_MONITOR)
    return Response(data=BusinessSummary(**summary))


@router.get("/activities/paginate", summary="活动日志分页查询")
async def get_activities_paginated(
    query: Annotated[ActivityPaginatedQuery, Query(...)],
    crud: ActivityLogCrudDep,
) -> Response[PaginatedResponse[ActivityResponse]]:
    """分页查询活动日志，支持按事件类型、用户、时间范围过滤。"""
    result = await crud.get_paginated(
        event_type=query.event_type,
        user_id=query.user_id,
        start_time=query.start_time,
        end_time=query.end_time,
        page=query.page,
        size=query.page_size,
    )
    return Response(data=result)


@router.get("/activities", summary="最近系统活动")
async def get_activities(crud: ActivityLogCrudDep) -> Response[list[ActivityResponse]]:
    """获取最近 15 条系统活动日志。"""
    records = await crud.get_recent(limit=15)
    data = [ActivityResponse.model_validate(r) for r in records]
    return Response(data=data)


@router.get("/plugins", summary="插件状态列表")
async def get_plugin_status(request: Request) -> Response[list[PluginStatusItem]]:
    """返回所有插件的加载状态、版本、耗时和健康信息。"""
    plugins = getattr(request.app.state, "plugins", [])
    load_result = getattr(request.app.state, "plugin_load_result", None)
    plugin_meta: dict[str, PluginMeta] = getattr(request.app.state, "plugin_meta", {})

    disabled = load_result.disabled if load_result else []
    errors = load_result.errors if load_result else {}

    raw_items = build_plugin_status_list(plugins, plugin_meta, disabled, errors)
    items = [PluginStatusItem(**_plugin_status_to_schema(d)) for d in raw_items]
    return Response(data=items)


@router.get("/plugins/dependencies", summary="插件依赖关系图")
async def get_plugin_dependencies(request: Request) -> Response[PluginDependencyGraph]:
    """返回插件依赖关系图的节点和边，用于前端可视化。"""
    plugins = getattr(request.app.state, "plugins", [])
    load_result = getattr(request.app.state, "plugin_load_result", None)
    plugin_meta: dict[str, PluginMeta] = getattr(request.app.state, "plugin_meta", {})

    disabled = load_result.disabled if load_result else []
    errors = load_result.errors if load_result else {}

    graph = build_plugin_dependency_graph(plugins, plugin_meta, disabled, errors)
    return Response(
        data=PluginDependencyGraph(
            nodes=[PluginNode(**n) for n in graph["nodes"]],
            edges=[PluginEdge(**e) for e in graph["edges"]],
        )
    )


@router.get("/events", summary="EventBus 统计")
async def get_event_bus_stats() -> Response[EventBusStats]:
    """返回 EventBus 的死信记录和 handler 错误统计。"""

    dead_letters = [
        DeadLetterResponse(
            event_name=dl.event_name,
            timestamp=dl.timestamp.isoformat(),
            source=dl.source,
        )
        for dl in event_bus.dead_letters
    ]

    return Response(
        data=EventBusStats(
            handler_errors=event_bus.handler_errors,
            dead_letters=dead_letters,
            dead_letter_count=len(dead_letters),
        )
    )
