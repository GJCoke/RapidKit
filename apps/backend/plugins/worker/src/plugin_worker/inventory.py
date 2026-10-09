"""Shared scope for the current managed worker inventory."""

from rapidkit_core.config import settings
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import col

from plugin_worker.models import CeleryWorker


def scoped_worker_filters() -> list[ColumnElement[bool]]:
    """Restrict current views to configured names, or discover all workers."""
    if settings.CELERY_WORKER_NAMES:
        return [col(CeleryWorker.hostname).in_(settings.CELERY_WORKER_NAMES)]
    return []


def is_current_worker(hostname: str) -> bool:
    """Whether a worker belongs to the configured roster or discovery mode."""
    return not settings.CELERY_WORKER_NAMES or hostname in settings.CELERY_WORKER_NAMES
