"""
Celery app and config.

Author  : Coke
Date    : 2025-04-10
"""

import sys

from celery.signals import beat_init, worker_process_init, worker_process_shutdown, worker_shutdown
from celery.signals import setup_logging as setup_logging_signal
from rapidkit_core.config import settings

from src.observability import init_sentry
from src.queues.celery import Celery

REDIS_URL = str(settings.CELERY_REDIS_URL)
DATABASE_URL = str(settings.ASYNC_DATABASE_POSTGRESQL_URL)
app = Celery("celery_app", broker=REDIS_URL, backend=REDIS_URL)
app.conf.update(
    {
        "timezone": settings.DATETIME_TIMEZONE,
        "enable_utc": True,
        "database_url": DATABASE_URL,
        "refresh_interval": 60,
        "worker_consumer": "src.queues.worker_consumer:SafeConsumer",
    }
)

# Core cross-cutting task modules (always loaded)
_CORE_TASK_MODULES = ["src.sio.tasks", "src.queues.tasks.schedule_test"]

# Core beat schedule entries (cross-cutting concerns)
_CORE_BEAT_SCHEDULE: dict[str, dict] = {
    "cleanup-stale-online-users": {
        "task": "cleanup_stale_online_users",
        "schedule": 120.0,
    },
}


def configure_from_plugins() -> None:
    """Configure plugin tasks and schedules before Celery finalizes its registry."""
    from rapidkit_framework.loader import discover_and_load_plugins, resolve_services
    from rapidkit_framework.services import service_registry

    result = discover_and_load_plugins(register_event_listeners=False)
    plugins = result.plugins
    resolve_services(service_registry, plugins)

    task_modules = list(_CORE_TASK_MODULES)
    beat_schedule = dict(_CORE_BEAT_SCHEDULE)

    for plugin in plugins:
        task_modules.extend(plugin.task_modules)
        beat_schedule.update(plugin.beat_schedule)

    existing_imports = tuple(app.conf.imports or ())
    app.conf.imports = tuple(dict.fromkeys((*existing_imports, *task_modules)))
    app.conf.beat_schedule = beat_schedule


configure_from_plugins()


# 导入信号处理器，确保 Worker 启动时注册
if settings.ENABLE_CELERY_MONITOR:
    import src.queues.signals  # noqa: F401, E402


@setup_logging_signal.connect
def configure_process_logging(*, service: str | None = None, **kwargs):
    """Own the pipeline in worker/beat parents, before Celery redirects stdout."""
    from rapidkit_core.log import set_custom_logfile, setup_logging

    if service is None:
        service = "beat" if "beat" in sys.argv[1:] and "worker" not in sys.argv[1:] else "worker"
    setup_logging(service=service)
    set_custom_logfile()
    init_sentry()


@worker_process_init.connect
def init_worker_logging(**kwargs):
    """Rebind each prefork child's file sinks and stdout pipeline."""
    configure_process_logging()


@worker_process_shutdown.connect
@worker_shutdown.connect
def flush_worker_logging(**kwargs):
    from rapidkit_core.log import complete_logging

    complete_logging()


@beat_init.connect
def init_beat_observability(**kwargs):
    configure_process_logging(service="beat")
    from src.runtime_metrics import start_process_exporter

    start_process_exporter()
