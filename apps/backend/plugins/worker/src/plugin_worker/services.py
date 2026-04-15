"""
Worker domain service layer.

Author  : Claude
Date    : 2026-03-30
"""

from celery import Celery
from rapidkit_core.exceptions import AppException
from rapidkit_core.log import logger
from rapidkit_core.status_codes import StatusCode

from plugin_worker.schemas import TriggerTaskResponse


def get_registered_tasks(celery_app: Celery) -> list[str]:
    celery_app.loader.import_default_modules()
    return sorted([name for name in celery_app.tasks if not name.startswith("celery.")])


async def trigger_task(celery_app: Celery, task_name: str, args: list, kwargs: dict) -> TriggerTaskResponse:
    registered = get_registered_tasks(celery_app)
    if task_name not in registered:
        raise AppException(StatusCode.TASK_NOT_REGISTERED)
    try:
        task = celery_app.send_task(task_name, args=args, kwargs=kwargs)
    except Exception:
        logger.exception("Failed to trigger task: {task_name}", task_name=task_name)
        raise AppException(StatusCode.TASK_TRIGGER_FAILED)
    return TriggerTaskResponse(task_id=task.id)


# ==================== Worker Control ====================

CONTROL_TIMEOUT = 5.0


def ping_worker(celery_app: Celery, hostname: str) -> bool:
    try:
        response = celery_app.control.ping(destination=[hostname], timeout=CONTROL_TIMEOUT)
        return bool(response)
    except Exception:
        logger.exception("Failed to ping worker: {hostname}", hostname=hostname)
        return False


def shutdown_worker(celery_app: Celery, hostname: str) -> None:
    try:
        celery_app.control.broadcast("shutdown", destination=[hostname])
    except Exception:
        logger.exception("Failed to shutdown worker: {hostname}", hostname=hostname)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def pool_grow(celery_app: Celery, hostname: str, n: int = 1) -> None:
    try:
        reply = celery_app.control.pool_grow(n, destination=[hostname], reply=True, timeout=5)
        _check_pool_reply(reply, hostname, "pool_grow")
    except AppException:
        raise
    except Exception:
        logger.exception("Failed to pool_grow worker: {hostname}", hostname=hostname)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def pool_shrink(celery_app: Celery, hostname: str, n: int = 1) -> None:
    try:
        reply = celery_app.control.pool_shrink(n, destination=[hostname], reply=True, timeout=5)
        _check_pool_reply(reply, hostname, "pool_shrink")
    except AppException:
        raise
    except Exception:
        logger.exception("Failed to pool_shrink worker: {hostname}", hostname=hostname)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def _check_pool_reply(reply: list | None, hostname: str, action: str) -> None:
    if not reply:
        logger.warning("No reply from worker {hostname} for {action}", hostname=hostname, action=action)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)
    result = reply[0].get(hostname, {})
    if isinstance(result, dict) and "error" in result:
        logger.warning(
            "Worker {hostname} rejected {action}: {error}", hostname=hostname, action=action, error=result["error"]
        )
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def add_consumer(celery_app: Celery, hostname: str, queue: str) -> None:
    try:
        celery_app.control.add_consumer(queue, destination=[hostname])
    except Exception:
        logger.exception("Failed to add_consumer: {hostname} {queue}", hostname=hostname, queue=queue)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def cancel_consumer(celery_app: Celery, hostname: str, queue: str) -> None:
    try:
        celery_app.control.cancel_consumer(queue, destination=[hostname])
    except Exception:
        logger.exception("Failed to cancel_consumer: {hostname} {queue}", hostname=hostname, queue=queue)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def get_active_tasks(celery_app: Celery, hostname: str) -> list[dict]:
    try:
        inspector = celery_app.control.inspect(destination=[hostname], timeout=CONTROL_TIMEOUT)
        result = inspector.active()
        if result and hostname in result:
            return result[hostname]
        return []
    except Exception:
        logger.exception("Failed to get active tasks: {hostname}", hostname=hostname)
        return []


def get_reserved_tasks(celery_app: Celery, hostname: str) -> list[dict]:
    try:
        inspector = celery_app.control.inspect(destination=[hostname], timeout=CONTROL_TIMEOUT)
        result = inspector.reserved()
        if result and hostname in result:
            return result[hostname]
        return []
    except Exception:
        logger.exception("Failed to get reserved tasks: {hostname}", hostname=hostname)
        return []


def revoke_task(celery_app: Celery, task_id: str, *, terminate: bool = False) -> None:
    try:
        celery_app.control.revoke(task_id, terminate=terminate, signal="SIGTERM")
    except Exception:
        logger.exception("Failed to revoke task: {task_id}", task_id=task_id)
        raise AppException(StatusCode.TASK_REVOKE_FAILED)
