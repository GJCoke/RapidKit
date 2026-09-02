"""RapidKit Celery worker monitoring plugin."""

from rapidkit_common.protocols.operations import WorkerOperationsProvider
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry


def register() -> PluginManifest:
    """返回 worker 插件的 manifest。"""
    from fastapi import APIRouter

    from plugin_worker.api import router, task_router
    from plugin_worker.models import CeleryTaskResult, CeleryWorker, QueueDepthSnapshot
    from plugin_worker.operations import WorkerOperationsProviderImpl

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(WorkerOperationsProvider, WorkerOperationsProviderImpl())

    # 合并 worker 和 task 两个 router
    combined = APIRouter()
    combined.include_router(router)
    combined.include_router(task_router)

    return PluginManifest(
        name="worker",
        version="0.1.0",
        router=combined,
        models=[CeleryWorker, CeleryTaskResult, QueueDepthSnapshot],
        provides=[WorkerOperationsProvider],
        service_factories={WorkerOperationsProvider: register_services},
        task_modules=["plugin_worker.tasks"],
        beat_schedule={
            "capture-queue-depth": {
                "task": "capture_queue_depth",
                "schedule": 300.0,
            }
        },
        sio_modules=["plugin_worker.events"],
    )
