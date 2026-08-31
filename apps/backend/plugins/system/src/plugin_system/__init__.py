"""RapidKit system dashboard plugin."""

import asyncio
from typing import TYPE_CHECKING, Any

from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []
_sio: Any | None = None
_leader: Any = None


async def _startup(app: FastAPI) -> None:
    global _sio, _leader  # noqa: PLW0603
    from rapidkit_core.database import RedisManager
    from rapidkit_core.leader_election import LeaderElection
    from rapidkit_framework.events import event_bus

    from plugin_system.audit import audit_event_handler
    from plugin_system.push import push_error_stats_loop, push_resources_loop

    # Register wildcard audit handler (low priority — runs after business handlers)
    event_bus.on_pattern("*", audit_event_handler, priority=100)

    redis = RedisManager.client()
    _leader = LeaderElection(redis, "leader:system_push")
    await _leader.start()

    _sio = app.state.socket
    _tasks.append(asyncio.create_task(push_resources_loop(_sio, _leader)))
    _tasks.append(asyncio.create_task(push_error_stats_loop(_sio, _leader)))


async def _shutdown(_app: FastAPI) -> None:
    from rapidkit_framework.events import event_bus

    await event_bus.shutdown()
    if _leader:
        await _leader.stop()
    for t in _tasks:
        t.cancel()
    _tasks.clear()


def register() -> PluginManifest:
    """返回 system 插件的 manifest。"""
    from plugin_system.api import router
    from plugin_system.audit_dict.api import router as audit_dict_router
    from plugin_system.audit_dict.models import AuditDictionary
    from plugin_system.models import ActivityLog

    router.include_router(audit_dict_router)

    return PluginManifest(
        name="system",
        version="0.1.0",
        router=router,
        models=[ActivityLog, AuditDictionary],
        dashboard_modules=[
            DashboardModuleDef(
                key="dashboard.overview",
                required_permissions=(
                    "GET:/api/v1/users/stats/summary",
                    "GET:/api/v1/tasks/stats/summary",
                    "GET:/api/v1/system/stats/errors",
                    "GET:/api/v1/workers/all",
                ),
                realtime_topics=(
                    "dashboard:online_users",
                    "dashboard:worker_status",
                    "dashboard:task_completed",
                    "dashboard:error_stats",
                ),
            ),
            DashboardModuleDef(
                key="dashboard.application-health",
                required_permissions=("GET:/api/v1/system/stats/health",),
            ),
            DashboardModuleDef(
                key="dashboard.infrastructure",
                required_permissions=(
                    "GET:/api/v1/system/stats/infrastructure",
                    "GET:/api/v1/system/stats/resources",
                ),
                realtime_topics=("dashboard:resources",),
            ),
            DashboardModuleDef(
                key="dashboard.business",
                required_permissions=("GET:/api/v1/system/stats/business",),
            ),
            DashboardModuleDef(
                key="dashboard.activity",
                required_permissions=(
                    "GET:/api/v1/system/activities",
                    "GET:/api/v1/audit-dict",
                ),
                realtime_topics=("dashboard:activity",),
            ),
        ],
        dependencies=["auth", "menu", "script"],
        sio_modules=["plugin_system.events"],
        on_startup=[_startup],
        on_shutdown=[_shutdown],
    )
