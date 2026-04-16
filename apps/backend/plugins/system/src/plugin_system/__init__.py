"""RapidKit system dashboard plugin."""

import asyncio
from typing import TYPE_CHECKING, Any

from rapidkit_core.events import ActivityLogEvent, event_bus
from rapidkit_core.plugin import PluginManifest

from plugin_system.models import ActivityLog

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []
_sio: Any | None = None


async def _startup(app: FastAPI) -> None:
    global _sio  # noqa: PLW0603
    from plugin_system.push import push_error_stats_loop, push_resources_loop

    _sio = app.state.socket
    _tasks.append(asyncio.create_task(push_resources_loop(_sio)))
    _tasks.append(asyncio.create_task(push_error_stats_loop(_sio)))


async def _shutdown(_app: FastAPI) -> None:
    await event_bus.shutdown()
    for t in _tasks:
        t.cancel()
    _tasks.clear()


async def _on_activity_event(event: ActivityLogEvent) -> None:
    """事件总线 activity.log 监听器。"""
    from rapidkit_core.database import AsyncSessionLocal

    from plugin_system.services import log_activity

    async with AsyncSessionLocal() as session:
        await log_activity(
            session,
            event_type=event.event_type,
            params=event.params,
            detail=event.detail,
            source_ip=event.source_ip,
            sio=_sio,
        )


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
        event_listeners=[(ActivityLogEvent, _on_activity_event)],
    )
