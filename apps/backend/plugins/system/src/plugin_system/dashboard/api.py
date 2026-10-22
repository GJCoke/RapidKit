import asyncio
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.routing import APIRoute
from rapidkit_common.access import Require
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import Response
from rapidkit_core.config import settings
from rapidkit_core.timezone import timezone
from rapidkit_framework.events import event_bus
from rapidkit_framework.plugin import PluginMeta

from plugin_system.audit.metrics import counters as audit_delivery_counters
from plugin_system.dashboard.health import check_minio, check_pg, check_redis
from plugin_system.dashboard.operations import build_operations_overview
from plugin_system.dashboard.push import _RESOURCE_KEY_PREFIX
from plugin_system.dashboard.schemas import (
    BusinessSummary,
    DeadLetterResponse,
    ErrorStats,
    EventBusStats,
    HealthStats,
    InfrastructureHealth,
    InstanceResourceStats,
    MultiResourceStats,
    OperationsOverviewQuery,
    OperationsOverviewResponse,
    PluginDependencyGraph,
    PluginEdge,
    PluginErrorResponse,
    PluginNode,
    PluginStatusItem,
)
from plugin_system.dashboard.services import (
    aggregate_instances,
    build_business_summary,
    build_plugin_dependency_graph,
    build_plugin_status_list,
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
)


@router.get("/stats/operations-overview", summary="运营总览", dependencies=[Require("dashboard:read")])
async def get_operations_overview(
    request: Request,
    query: Annotated[OperationsOverviewQuery, Query(...)],
) -> Response[OperationsOverviewResponse]:
    """按查询条件汇总用户、业务与系统运行状态，返回运营总览。"""
    started_at = getattr(request.app.state, "started_at", timezone.now())
    return Response(data=await build_operations_overview(query, started_at))


def _plugin_status_to_schema(d: dict) -> dict:
    """转换服务层的插件状态字典，用于构造插件状态响应。"""
    d = dict(d)
    if d.get("error") is not None:
        d["error"] = PluginErrorResponse(**d["error"])
    return d


@router.get("/stats/resources", summary="服务器资源统计", dependencies=[Require("dashboard:infrastructure")])
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


@router.get("/stats/errors", summary="错误统计", dependencies=[Require("dashboard:errors")])
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


@router.get("/stats/health", summary="应用健康统计", dependencies=[Require("dashboard:health")])
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
            audit_delivery=dict(audit_delivery_counters),
            qps=qps,
            p50_ms=p50,
            p95_ms=p95,
            http_5xx_1h=http_5xx,
            biz_errors_1h=biz_errors,
            ws_connections=ws_connections,
        )
    )


@router.get("/stats/infrastructure", summary="基础设施健康状态", dependencies=[Require("dashboard:infrastructure")])
async def get_infrastructure_health(session: SessionDep, redis: RedisDep) -> Response[InfrastructureHealth]:
    """检查 PostgreSQL、Redis、MinIO 的健康状态。"""
    pg_health, redis_health, minio_health = await asyncio.gather(
        check_pg(session),
        check_redis(redis),
        check_minio(),
    )

    return Response(data=InfrastructureHealth(pg=pg_health, redis=redis_health, minio=minio_health))


@router.get("/stats/business", summary="业务数据汇总", dependencies=[Require("dashboard:business")])
async def get_business_summary(session: SessionDep, request: Request) -> Response[BusinessSummary]:
    """获取各业务模块的数据总量。"""
    route_count = len(
        {
            (r.path, tuple(sorted(r.methods)))
            for r in request.app.routes
            if isinstance(r, APIRoute) and r.include_in_schema
        }
    )
    summary = await build_business_summary(
        session, enable_celery=settings.ENABLE_CELERY_MONITOR, route_count=route_count
    )
    return Response(data=BusinessSummary(**summary))


@router.get("/plugins", summary="插件状态列表", dependencies=[Require("plugin:read")])
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


@router.get("/plugins/dependencies", summary="插件依赖关系图", dependencies=[Require("plugin:read")])
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


@router.get("/events", summary="EventBus 统计", dependencies=[Require("plugin:read")])
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
