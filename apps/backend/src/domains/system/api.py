"""
系统统计 API 路由。

Author : Coke
Date   : 2026-04-10
"""

import time

from fastapi import APIRouter, Depends, Query
from sqlmodel import func, select

from src.common.deps import RedisDep, SessionDep
from src.common.schemas.response import Response
from src.domains.menu.models import Menu
from src.domains.role.deps import verify_user_permission
from src.domains.role.models import Role
from src.domains.router.models import InterfaceRouter
from src.domains.script.models import Script
from src.domains.system.deps import ActivityLogCrudDep
from src.domains.system.schemas import (
    ActivityResponse,
    BusinessSummary,
    ErrorStats,
    HealthStats,
    InfrastructureHealth,
    InstanceResourceStats,
    MultiResourceStats,
    ServiceHealth,
)
from src.domains.system.services import MetricsService

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
    from src.domains.system.push import _RESOURCE_KEY_PREFIX

    if instance:
        data = await redis.hgetall(f"{_RESOURCE_KEY_PREFIX}{instance}")
        if not data:
            parsed = _empty_instance(instance)
        else:
            parsed = _parse_instance(data)
        return Response(data=MultiResourceStats(instances=[parsed], summary=parsed))

    # 扫描所有实例
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
    metrics = MetricsService(redis)
    http_5xx, biz_errors = await metrics.get_error_counts(hours=1)
    total_requests = await metrics.get_total_requests(hours=1)
    sparkline = await metrics.get_error_sparkline_24h()

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
async def get_health_stats(redis: RedisDep) -> Response[HealthStats]:
    """获取 QPS、响应时间 P50/P95 和错误计数。"""
    metrics = MetricsService(redis)
    qps = await metrics.get_qps()
    p50, p95 = await metrics.get_response_time_percentiles()
    http_5xx, biz_errors = await metrics.get_error_counts(hours=1)

    # WebSocket 连接数（仅统计默认 namespace，避免多 namespace 重复计数）
    from src.sio.app import socket

    try:
        rooms = socket.manager.rooms.get("/", {})
        ws_connections = len(rooms.get(None, set()))
    except Exception:
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
    # PostgreSQL
    pg_health = await _check_pg(session)
    # Redis
    redis_health = await _check_redis(redis)
    # MinIO
    minio_health = _check_minio()

    return Response(data=InfrastructureHealth(pg=pg_health, redis=redis_health, minio=minio_health))


@router.get("/stats/business", summary="业务数据汇总")
async def get_business_summary(session: SessionDep) -> Response[BusinessSummary]:
    """获取各业务模块的数据总量。"""
    roles = (await session.exec(select(func.count()).select_from(Role))).one()
    menus = (await session.exec(select(func.count()).select_from(Menu))).one()
    routers = (await session.exec(select(func.count()).select_from(InterfaceRouter))).one()
    scripts = (await session.exec(select(func.count()).select_from(Script))).one()

    # 定时任务数量 — 仅在 Celery Monitor 启用时查询
    schedules = 0
    try:
        from src.core.config import settings

        if settings.ENABLE_CELERY_MONITOR:
            from src.queues.schedule import PeriodicTask

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


# ==================== 内部辅助函数 ====================


async def _check_pg(session: SessionDep) -> ServiceHealth:
    """检查 PostgreSQL 连接健康。"""
    try:
        start = time.time()
        await session.exec(select(func.now()))
        latency = round((time.time() - start) * 1000, 2)

        # 连接池信息
        from sqlalchemy.pool import QueuePool

        engine = session.get_bind()
        pool = engine.pool  # ty: ignore[unresolved-attribute]
        assert isinstance(pool, QueuePool)
        pool_info = {
            "pool_size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
        return ServiceHealth(status="healthy", latency_ms=latency, details=pool_info)
    except Exception as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})


async def _check_redis(redis: RedisDep) -> ServiceHealth:
    """检查 Redis 连接健康。"""
    try:
        start = time.time()
        await redis.ping()  # ty: ignore[invalid-await]
        latency = round((time.time() - start) * 1000, 2)

        info = await redis.info("memory")
        stats = await redis.info("stats")
        details = {
            "used_memory_human": info.get("used_memory_human", ""),
            "keyspace_hits": stats.get("keyspace_hits", 0),
            "keyspace_misses": stats.get("keyspace_misses", 0),
        }
        hits = details["keyspace_hits"]
        misses = details["keyspace_misses"]
        if hits + misses > 0:
            details["hit_rate"] = round(hits / (hits + misses) * 100, 2)

        return ServiceHealth(status="healthy", latency_ms=latency, details=details)
    except Exception as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})


def _check_minio() -> ServiceHealth:
    """检查 MinIO 连接健康。"""
    try:
        from src.core.config import settings

        start = time.time()
        client = __import__("minio").Minio(
            "localhost:9000",
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD.get_secret_value(),
            secure=False,
        )
        buckets = client.list_buckets()
        latency = round((time.time() - start) * 1000, 2)

        return ServiceHealth(
            status="healthy",
            latency_ms=latency,
            details={"bucket_count": len(buckets)},
        )
    except Exception as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})


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
