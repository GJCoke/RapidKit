"""RapidKit system dashboard plugin."""

import asyncio
from typing import TYPE_CHECKING

from rapidkit_core.plugin import PluginManifest

from plugin_system.models import ActivityLog

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []


async def _startup(app: FastAPI) -> None:
    from plugin_system.push import push_error_stats_loop, push_resources_loop

    socket = app.state.socket
    _tasks.append(asyncio.create_task(push_resources_loop(socket)))
    _tasks.append(asyncio.create_task(push_error_stats_loop(socket)))


async def _shutdown(app: FastAPI) -> None:
    for t in _tasks:
        t.cancel()
    _tasks.clear()


def _on_activity_event(data: dict) -> None:
    """事件总线 activity.log 监听器。"""
    from plugin_system.services import ActivityService

    ActivityService.log_activity_fire_and_forget(**data)


def register() -> PluginManifest:
    """返回 system 插件的 manifest。"""
    from plugin_system.api import router

    return PluginManifest(
        name="system",
        version="0.1.0",
        router=router,
        models=[ActivityLog],
        dependencies=["auth", "menu", "script"],
        on_startup=[_startup],
        on_shutdown=[_shutdown],
        event_listeners=[("activity.log", _on_activity_event)],
    )
