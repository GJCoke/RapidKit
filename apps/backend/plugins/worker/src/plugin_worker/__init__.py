"""RapidKit Celery worker monitoring plugin."""

from rapidkit_framework.plugin import PluginManifest


def register() -> PluginManifest:
    """返回 worker 插件的 manifest。"""
    from fastapi import APIRouter

    from plugin_worker.api import router, task_router
    from plugin_worker.models import CeleryTaskResult, CeleryWorker

    # 合并 worker 和 task 两个 router
    combined = APIRouter()
    combined.include_router(router)
    combined.include_router(task_router)

    return PluginManifest(
        name="worker",
        version="0.1.0",
        router=combined,
        models=[CeleryWorker, CeleryTaskResult],
        sio_modules=["plugin_worker.events"],
    )
