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
    from rapidkit_common.events import PluginLoadFailedEvent
    from rapidkit_core.database import RedisManager
    from rapidkit_core.leader_election import LeaderElection
    from rapidkit_core.timezone import timezone
    from rapidkit_core.uuid7 import uuid7
    from rapidkit_framework.events import event_bus

    from plugin_system.activity_projector import configure_activity_publisher
    from plugin_system.push import push_error_stats_loop, push_resources_loop

    app.state.started_at = timezone.now()
    redis = RedisManager.client()
    _leader = LeaderElection(redis, "leader:system_push")
    await _leader.start()

    _sio = app.state.socket
    configure_activity_publisher(_sio)
    load_result = getattr(app.state, "plugin_load_result", None)
    for plugin_name, error in getattr(load_result, "errors", {}).items():
        event_bus.fire_and_forget(
            PluginLoadFailedEvent(
                event_id=str(uuid7()),
                occurred_at=timezone.now(),
                plugin_name=plugin_name,
                error_summary=str(error),
            )
        )
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
    from rapidkit_common.events import (
        PluginLoadFailedEvent,
        TaskFailedEvent,
        TaskSucceededEvent,
        UserLoginEvent,
        WorkerOfflineEvent,
    )

    from plugin_system.activity_projector import handle_activity_event
    from plugin_system.api import router
    from plugin_system.models import ActivityEvent, AuditLog

    return PluginManifest(
        name="system",
        version="0.1.0",
        router=router,
        models=[AuditLog, ActivityEvent],
        dashboard_modules=[
            DashboardModuleDef(
                key="dashboard.overview",
                required_permissions=("GET:/api/v1/system/stats/operations-overview",),
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
                ),
                realtime_topics=("dashboard:activity.created",),
            ),
        ],
        dependencies=["auth", "menu", "script"],
        sio_modules=["plugin_system.events"],
        on_startup=[_startup],
        on_shutdown=[_shutdown],
        event_listeners=[
            (UserLoginEvent, handle_activity_event),
            (TaskSucceededEvent, handle_activity_event),
            (TaskFailedEvent, handle_activity_event),
            (WorkerOfflineEvent, handle_activity_event),
            (PluginLoadFailedEvent, handle_activity_event),
        ],
    )
