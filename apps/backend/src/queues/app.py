"""
Celery app and config.

Author  : Coke
Date    : 2025-04-10
"""

from celery.signals import worker_process_init
from rapidkit_core.config import settings

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
    }
)

# Core cross-cutting task modules (always loaded)
_CORE_TASK_MODULES = ["src.sio.tasks"]

# Core beat schedule entries (cross-cutting concerns)
_CORE_BEAT_SCHEDULE: dict[str, dict] = {
    "cleanup-stale-online-users": {
        "task": "cleanup_stale_online_users",
        "schedule": 120.0,
    },
}


def configure_from_plugins() -> None:
    """Configure plugin tasks and schedules before Celery finalizes its registry."""
    from rapidkit_framework.loader import discover_and_load_plugins

    result = discover_and_load_plugins(register_event_listeners=False)
    plugins = result.plugins

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


@worker_process_init.connect
def init_worker_logging(**kwargs):
    """在 Celery worker 子进程中初始化 Loguru 日志管道。"""
    from rapidkit_core.log import set_custom_logfile, setup_logging

    setup_logging()
    set_custom_logfile()
