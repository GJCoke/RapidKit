"""RapidKit API monitoring plugin."""

import asyncio
from typing import TYPE_CHECKING, Any

from celery.schedules import crontab
from rapidkit_framework.plugin import PluginManifest

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []
_leader: Any = None


async def _startup(app: FastAPI) -> None:
    global _leader  # noqa: PLW0603
    from rapidkit_core.database import RedisManager
    from rapidkit_core.leader_election import LeaderElection

    from plugin_monitoring.push import push_api_stats_loop

    redis = RedisManager.client()
    _leader = LeaderElection(redis, "leader:monitoring_push")
    await _leader.start()

    socket = app.state.socket
    _tasks.append(asyncio.create_task(push_api_stats_loop(socket, _leader)))


async def _shutdown(app: FastAPI) -> None:
    if _leader:
        await _leader.stop()
    for t in _tasks:
        t.cancel()
    _tasks.clear()


def register() -> PluginManifest:
    """返回 monitoring 插件的 manifest。"""
    from plugin_monitoring.api import router
    from plugin_monitoring.models import ApiMetricsHourly

    return PluginManifest(
        name="monitoring",
        version="0.1.0",
        router=router,
        models=[ApiMetricsHourly],
        on_startup=[_startup],
        on_shutdown=[_shutdown],
        task_modules=["plugin_monitoring.tasks"],
        beat_schedule={
            "aggregate-api-metrics": {
                "task": "aggregate_api_metrics",
                "schedule": 60.0,
            },
            "cleanup-old-api-metrics": {
                "task": "cleanup_old_api_metrics",
                "schedule": crontab(hour=3, minute=0),
            },
        },
    )
