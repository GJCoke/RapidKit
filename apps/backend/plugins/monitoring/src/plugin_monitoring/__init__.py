"""RapidKit API monitoring plugin."""

import asyncio
from typing import TYPE_CHECKING

from rapidkit_core.plugin import PluginManifest

from plugin_monitoring.models import ApiMetricsHourly

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []


async def _startup(app: FastAPI) -> None:
    from plugin_monitoring.push import push_api_stats_loop

    socket = app.state.socket
    _tasks.append(asyncio.create_task(push_api_stats_loop(socket)))


async def _shutdown(app: FastAPI) -> None:
    for t in _tasks:
        t.cancel()
    _tasks.clear()


def register() -> PluginManifest:
    """返回 monitoring 插件的 manifest。"""
    from plugin_monitoring.api import router

    return PluginManifest(
        name="monitoring",
        version="0.1.0",
        router=router,
        models=[ApiMetricsHourly],
        on_startup=[_startup],
        on_shutdown=[_shutdown],
    )
