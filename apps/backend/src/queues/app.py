"""
Celery app and config.

Author  : Coke
Date    : 2025-04-10
"""

from src.core.config import settings
from src.queues.celery import Celery

REDIS_URL = str(settings.CELERY_REDIS_URL)
DATABASE_URL = str(settings.ASYNC_DATABASE_POSTGRESQL_URL)
app = Celery("celery_app", broker=REDIS_URL, backend=REDIS_URL)
app.conf.update({"timezone": settings.DATETIME_TIMEZONE, "database_url": DATABASE_URL, "refresh_interval": 60})

app.autodiscover_tasks(["src.queues.tasks"])

# 导入信号处理器，确保 Worker 启动时注册
if settings.ENABLE_CELERY_MONITOR:
    import src.queues.signals  # noqa: F401, E402

# TODO: this is delete code.
app.conf.beat_schedule = {
    "test_task2": {
        "task": "src.queues.tasks.tasks.test_task2",
        "schedule": 15,
    }
}
