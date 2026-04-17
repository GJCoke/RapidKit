"""
系统统计 API 路由。

Author : Coke
Date   : 2026-04-10
"""

from fastapi import APIRouter, Depends, Query, Request
from plugin_auth.role.models import Role
from plugin_auth.router.models import InterfaceRouter
from plugin_menu.models import Menu
from plugin_script.models import Script
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import Response
from rapidkit_core.config import settings
from rapidkit_core.events import event_bus
from rapidkit_core.plugin import HealthStatus, PluginMeta
from sqlmodel import func, select

from plugin_system.deps import ActivityLogCrudDep
from plugin_system.health import check_minio, check_pg, check_redis
from plugin_system.push import _RESOURCE_KEY_PREFIX
from plugin_system.schemas import (
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
    get_error_counts,
    get_error_sparkline_24h,
    get_qps,
    get_response_time_percentiles,
    get_total_requests,
)

router = APIRouter(
    prefix="/system",
    tags=["System"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/stats/resources", summary="服务器资源统计")
async def get_resource_stats(
    redis: RedisDep,
    instance: str | None = Query(None, description="实例 hostname，不传返回所有实例 + 汇总"),
) -> Response[MultiResourceStats]:
    """获取服务器资源，支持多实例汇总和按实例查询。"""

    if instance:
        data = await redis.hgetall(f"{_RESOURCE_KEY_PREFIX}{instance}")
        if not data:
            parsed = _empty_instance(instance)
        else:
            parsed = _parse_instance(data)
        return Response(data=MultiResourceStats(instances=[parsed], summary=parsed))

    instances: list[InstanceResourceStats] = []
    cursor: int = 0
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"{_RESOURCE_KEY_PREFIX}*", count=100)
        for key in keys:
            data = await redis.hgetall(key)
            if data:
                instances.append(_parse_instance(data))
        if cursor == 0:
            break

    summary = _aggregate_instances(instances)
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

    # 推导整体状态
    all_statuses: list[str] = []
    for svc in [infra.pg, infra.redis, infra.minio]:
        if svc.status == "down":
            all_statuses.append(HealthStatus.UNHEALTHY.value)
        elif svc.status == "degraded":
            all_statuses.append(HealthStatus.DEGRADED.value)
        else:
            all_statuses.append(HealthStatus.HEALTHY.value)

    if HealthStatus.UNHEALTHY.value in all_statuses:
        overall = HealthStatus.UNHEALTHY.value
    elif HealthStatus.DEGRADED.value in all_statuses:
        overall = HealthStatus.DEGRADED.value
    else:
        overall = HealthStatus.HEALTHY.value

    return Response(
        data=AggregatedHealth(
            status=overall,
            infrastructure=infra,
        )
    )


@router.get("/stats/business", summary="业务数据汇总")
async def get_business_summary(session: SessionDep) -> Response[BusinessSummary]:
    """获取各业务模块的数据总量。"""

    roles = (await session.exec(select(func.count()).select_from(Role))).one()
    menus = (await session.exec(select(func.count()).select_from(Menu))).one()
    routers = (await session.exec(select(func.count()).select_from(InterfaceRouter))).one()
    scripts = (await session.exec(select(func.count()).select_from(Script))).one()

    schedules = 0
    try:
        if settings.ENABLE_CELERY_MONITOR:
            from plugin_schedule.models import PeriodicTask

            schedules = (await session.exec(select(func.count()).select_from(PeriodicTask))).one()
    except Exception:
        pass

    return Response(
        data=BusinessSummary(
            roles=roles,
            menus=menus,
            routers=routers,
            scripts=scripts,
            schedules=schedules,
        )
    )


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

    items: list[PluginStatusItem] = []

    # 已加载的插件
    for plugin in plugins:
        meta = plugin_meta.get(plugin.name)
        dep_names = [d if isinstance(d, str) else d.name for d in plugin.dependencies]

        items.append(
            PluginStatusItem(
                name=plugin.name,
                version=plugin.version,
                status=meta.status if meta else "loaded",
                required=plugin.required,
                dependencies=dep_names,
                load_time_ms=meta.register_ms if meta else None,
                startup_time_ms=meta.startup_ms if meta else None,
            )
        )

    if load_result:
        # 禁用的插件
        for name in load_result.disabled:
            items.append(PluginStatusItem(name=name, status="disabled"))

        # 失败的插件
        for name, error in load_result.errors.items():
            items.append(
                PluginStatusItem(
                    name=name,
                    status="failed",
                    error=PluginErrorResponse(
                        phase=error.phase,
                        message=error.message,
                        caused_by=error.caused_by,
                    ),
                )
            )

    return Response(data=items)


@router.get("/plugins/dependencies", summary="插件依赖关系图")
async def get_plugin_dependencies(request: Request) -> Response[PluginDependencyGraph]:
    """返回插件依赖关系图的节点和边，用于前端可视化。"""

    plugins = getattr(request.app.state, "plugins", [])
    load_result = getattr(request.app.state, "plugin_load_result", None)
    plugin_meta: dict[str, PluginMeta] = getattr(request.app.state, "plugin_meta", {})

    nodes: list[PluginNode] = []
    edges: list[PluginEdge] = []

    # 已加载的插件
    for plugin in plugins:
        meta = plugin_meta.get(plugin.name)
        nodes.append(
            PluginNode(
                name=plugin.name,
                version=plugin.version,
                status=meta.status if meta else "loaded",
                required=plugin.required,
            )
        )
        for dep in plugin.dependencies:
            dep_name = dep if isinstance(dep, str) else dep.name
            edges.append(PluginEdge(source=plugin.name, target=dep_name))

    if load_result:
        for name in load_result.disabled:
            nodes.append(PluginNode(name=name, status="disabled", required=False))

        for name, error in load_result.errors.items():
            nodes.append(PluginNode(name=name, status="failed", required=False))

    return Response(data=PluginDependencyGraph(nodes=nodes, edges=edges))


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


# ==================== 多实例资源辅助函数 ====================


def _parse_instance(data: dict[str, str]) -> InstanceResourceStats:
    """将 Redis Hash 数据解析为 InstanceResourceStats。"""
    return InstanceResourceStats(
        hostname=data.get("hostname", "unknown"),
        cpu_percent=float(data.get("cpuPercent", 0)),
        memory_used=int(data.get("memoryUsed", 0)),
        memory_total=int(data.get("memoryTotal", 0)),
        memory_percent=float(data.get("memoryPercent", 0)),
        disk_used=int(data.get("diskUsed", 0)),
        disk_total=int(data.get("diskTotal", 0)),
        disk_percent=float(data.get("diskPercent", 0)),
        net_sent=int(data.get("netSent", 0)),
        net_recv=int(data.get("netRecv", 0)),
    )


def _empty_instance(hostname: str) -> InstanceResourceStats:
    """返回空实例数据。"""
    return InstanceResourceStats(
        hostname=hostname,
        cpu_percent=0,
        memory_used=0,
        memory_total=0,
        memory_percent=0,
        disk_used=0,
        disk_total=0,
        disk_percent=0,
        net_sent=0,
        net_recv=0,
    )


def _aggregate_instances(instances: list[InstanceResourceStats]) -> InstanceResourceStats:
    """汇总多实例资源数据。"""
    if not instances:
        return _empty_instance("summary")

    n = len(instances)
    total_mem = sum(i.memory_total for i in instances)
    total_disk = sum(i.disk_total for i in instances)

    return InstanceResourceStats(
        hostname="summary",
        cpu_percent=round(sum(i.cpu_percent for i in instances) / n, 1),
        memory_used=sum(i.memory_used for i in instances),
        memory_total=total_mem,
        memory_percent=round(sum(i.memory_used for i in instances) / total_mem * 100, 1) if total_mem else 0,
        disk_used=sum(i.disk_used for i in instances),
        disk_total=total_disk,
        disk_percent=round(sum(i.disk_used for i in instances) / total_disk * 100, 1) if total_disk else 0,
        net_sent=sum(i.net_sent for i in instances),
        net_recv=sum(i.net_recv for i in instances),
    )
