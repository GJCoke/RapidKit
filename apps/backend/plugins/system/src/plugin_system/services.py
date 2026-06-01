"""
系统领域服务。

Author : Coke
Date   : 2026-04-10
"""

from datetime import timedelta
from typing import Any

from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.timezone import timezone
from rapidkit_framework.plugin import HealthStatus
from sqlmodel import text
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_system.schemas import InstanceResourceStats


async def get_qps(redis: AsyncRedisClient, minutes: int = 60) -> float:
    """计算最近 N 分钟的平均 QPS。"""
    now = timezone.now()
    total = 0
    for i in range(minutes):
        bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
        count = await redis.hget(f"metrics:qps:{bucket}", "count")
        if count:
            total += int(count)
    return round(total / (minutes * 60), 2) if minutes > 0 else 0


async def get_response_time_percentiles(redis: AsyncRedisClient, minutes: int = 60) -> tuple[float, float]:
    """计算最近 N 分钟的 P50 和 P95 响应时间。"""
    now = timezone.now()
    all_times: list[float] = []
    for i in range(minutes):
        bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
        key = f"metrics:rt:{bucket}"
        scores = await redis.zrangebyscore(key, "-inf", "+inf", withscores=True)
        if scores:
            all_times.extend(score for _, score in scores)

    if not all_times:
        return 0.0, 0.0

    all_times.sort()
    n = len(all_times)
    p50 = all_times[int(n * 0.5)]
    p95 = all_times[int(n * 0.95)] if n > 1 else all_times[0]
    return round(p50, 2), round(p95, 2)


async def get_error_counts(redis: AsyncRedisClient, hours: int = 1) -> tuple[int, int]:
    """获取最近 N 小时的 HTTP 5xx 和业务异常计数。"""
    now = timezone.now()
    http_5xx = 0
    biz_errors = 0
    for i in range(hours):
        bucket = (now - timedelta(hours=i)).strftime("%Y%m%d_%H")
        count_5xx = await redis.hget(f"metrics:errors:5xx:{bucket}", "count")
        count_biz = await redis.hget(f"metrics:errors:biz:{bucket}", "count")
        if count_5xx:
            http_5xx += int(count_5xx)
        if count_biz:
            biz_errors += int(count_biz)
    return http_5xx, biz_errors


async def get_total_requests(redis: AsyncRedisClient, hours: int = 1) -> int:
    """获取最近 N 小时的总请求数。"""
    now = timezone.now()
    total = 0
    for i in range(hours * 60):
        bucket = (now - timedelta(minutes=i)).strftime("%Y%m%d_%H%M")
        count = await redis.hget(f"metrics:qps:{bucket}", "count")
        if count:
            total += int(count)
    return total


async def get_error_sparkline_24h(redis: AsyncRedisClient) -> list[float]:
    """获取过去 24 小时每小时的错误数。"""
    now = timezone.now()
    sparkline: list[float] = []
    for i in range(23, -1, -1):
        bucket = (now - timedelta(hours=i)).strftime("%Y%m%d_%H")
        count_5xx = await redis.hget(f"metrics:errors:5xx:{bucket}", "count")
        count_biz = await redis.hget(f"metrics:errors:biz:{bucket}", "count")
        total = (int(count_5xx) if count_5xx else 0) + (int(count_biz) if count_biz else 0)
        sparkline.append(float(total))
    return sparkline


# ==================== 多实例资源辅助函数 ====================


def parse_instance(data: dict[str, str]) -> InstanceResourceStats:
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


def empty_instance(hostname: str) -> InstanceResourceStats:
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


# ==================== 健康 & 业务汇总 ====================


def derive_overall_health(service_statuses: list[str]) -> str:
    """Derive an overall health status from individual service statuses.

    Maps raw service status strings ("down" → unhealthy, "degraded" → degraded,
    anything else → healthy) then picks the worst across all services.
    """
    mapped: list[str] = []
    for status in service_statuses:
        if status == "down":
            mapped.append(HealthStatus.UNHEALTHY.value)
        elif status == "degraded":
            mapped.append(HealthStatus.DEGRADED.value)
        else:
            mapped.append(HealthStatus.HEALTHY.value)

    if HealthStatus.UNHEALTHY.value in mapped:
        return HealthStatus.UNHEALTHY.value
    if HealthStatus.DEGRADED.value in mapped:
        return HealthStatus.DEGRADED.value
    return HealthStatus.HEALTHY.value


async def build_business_summary(session: AsyncSession, *, enable_celery: bool) -> dict[str, int]:
    """Count rows in core business tables and return a plain dict."""

    async def _count(table: str) -> int:
        result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))  # ty: ignore[deprecated]
        return result.scalar_one()

    roles = await _count("permission_roles")
    menus = await _count("menu_menus")
    routers = await _count("permission_routers")
    scripts = await _count("script_scripts")

    schedules = 0
    try:
        if enable_celery:
            schedules = await _count("schedule_periodic_tasks")
    except Exception:
        pass

    return {
        "roles": roles,
        "menus": menus,
        "routers": routers,
        "scripts": scripts,
        "schedules": schedules,
    }


# ==================== 插件状态 ====================


def build_plugin_status_list(
    plugins: list[Any],
    plugin_meta: dict[str, Any],
    disabled: list[str],
    errors: dict[str, Any],
) -> list[dict]:
    """Build a flat list of plugin status dicts from loader results."""
    items: list[dict] = []

    for plugin in plugins:
        meta = plugin_meta.get(plugin.name)
        dep_names = [d if isinstance(d, str) else d.name for d in plugin.dependencies]
        items.append(
            {
                "name": plugin.name,
                "version": plugin.version,
                "status": meta.status if meta else "loaded",
                "required": plugin.required,
                "dependencies": dep_names,
                "load_time_ms": meta.register_ms if meta else None,
                "startup_time_ms": meta.startup_ms if meta else None,
                "error": None,
            }
        )

    for name in disabled:
        items.append({"name": name, "status": "disabled"})

    for name, error in errors.items():
        items.append(
            {
                "name": name,
                "status": "failed",
                "error": {
                    "phase": error.phase,
                    "message": error.message,
                    "caused_by": error.caused_by,
                },
            }
        )

    return items


def build_plugin_dependency_graph(
    plugins: list[Any],
    plugin_meta: dict[str, Any],
    disabled: list[str],
    errors: dict[str, Any],
) -> dict[str, list[dict]]:
    """Build a dependency graph (nodes + edges) from loader results."""
    nodes: list[dict] = []
    edges: list[dict] = []

    for plugin in plugins:
        meta = plugin_meta.get(plugin.name)
        nodes.append(
            {
                "name": plugin.name,
                "version": plugin.version,
                "status": meta.status if meta else "loaded",
                "required": plugin.required,
            }
        )
        for dep in plugin.dependencies:
            dep_name = dep if isinstance(dep, str) else dep.name
            edges.append({"source": plugin.name, "target": dep_name})

    for name in disabled:
        nodes.append({"name": name, "status": "disabled", "required": False})

    for name, _error in errors.items():
        nodes.append({"name": name, "status": "failed", "required": False})

    return {"nodes": nodes, "edges": edges}


def aggregate_instances(instances: list[InstanceResourceStats]) -> InstanceResourceStats:
    """汇总多实例资源数据。"""
    if not instances:
        return empty_instance("summary")

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
