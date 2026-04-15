"""
Celery app and config.

Author  : Coke
Date    : 2025-04-10
"""

# autodiscover_tasks 默认只查找 tasks.py，用 pkgutil 扫描所有子模块
import pkgutil

from celery.schedules import crontab
from celery.signals import worker_process_init
from rapidkit_core.config import settings

import src.queues.tasks as _tasks_pkg
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

app.conf.beat_schedule = {
    "aggregate-api-metrics": {
        "task": "aggregate_api_metrics",
        "schedule": 60.0,
    },
    "cleanup-old-api-metrics": {
        "task": "cleanup_old_api_metrics",
        "schedule": crontab(hour=3, minute=0),
    },
}

for _info in pkgutil.iter_modules(_tasks_pkg.__path__):
    app.autodiscover_tasks(["src.queues.tasks"], related_name=_info.name)

# 导入信号处理器，确保 Worker 启动时注册
if settings.ENABLE_CELERY_MONITOR:
    import src.queues.signals  # noqa: F401, E402


@worker_process_init.connect
def init_worker_logging(**kwargs):
    """在 Celery worker 进程中初始化 Loguru 日志管道。"""
    from rapidkit_core.log import set_custom_logfile, setup_logging

    setup_logging()
    set_custom_logfile()
