"""
Worker domain service layer.

Author  : Claude
Date    : 2026-03-30
"""

from src.core.exceptions import AppException
from src.core.log import logger
from src.core.status_codes import StatusCode
from src.domains.worker.schemas import TriggerTaskResponse
from src.queues.app import app as celery_app


def get_registered_tasks() -> list[str]:
    """
    获取所有已注册的 Celery 任务列表。

    过滤掉 Celery 内置任务（以 celery. 开头的任务）。

    Returns:
        已注册的任务名列表。
    """
    # 确保 autodiscover_tasks 在 FastAPI 进程中也完成任务模块的导入
    celery_app.loader.import_default_modules()
    return sorted([name for name in celery_app.tasks if not name.startswith("celery.")])


async def trigger_task(
    task_name: str,
    args: list,
    kwargs: dict,
) -> TriggerTaskResponse:
    """
    手动触发一个已注册的 Celery 任务。

    Args:
        task_name: 已注册的任务名。
        args: 位置参数。
        kwargs: 关键字参数。

    Returns:
        包含 task_id 的响应。

    Raises:
        AppException: 任务未注册或触发失败时抛出。
    """
    registered = get_registered_tasks()
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


def ping_worker(hostname: str) -> bool:
    """
    Ping Worker 检查是否可达。

    Args:
        hostname: Worker 主机名。

    Returns:
        是否可达。
    """
    try:
        response = celery_app.control.ping(destination=[hostname], timeout=CONTROL_TIMEOUT)
        return bool(response)
    except Exception:
        logger.exception("Failed to ping worker: {hostname}", hostname=hostname)
        return False


def shutdown_worker(hostname: str) -> None:
    """
    优雅关闭 Worker。

    Args:
        hostname: Worker 主机名。

    Raises:
        AppException: 关闭失败时抛出。
    """
    try:
        celery_app.control.broadcast("shutdown", destination=[hostname])
    except Exception:
        logger.exception("Failed to shutdown worker: {hostname}", hostname=hostname)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def pool_grow(hostname: str, n: int = 1) -> None:
    """
    扩容 Worker Pool。

    Args:
        hostname: Worker 主机名。
        n: 增加的工作进程数。

    Raises:
        AppException: 操作失败时抛出。
    """
    try:
        reply = celery_app.control.pool_grow(n, destination=[hostname], reply=True, timeout=5)
        _check_pool_reply(reply, hostname, "pool_grow")
    except AppException:
        raise
    except Exception:
        logger.exception("Failed to pool_grow worker: {hostname}", hostname=hostname)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def pool_shrink(hostname: str, n: int = 1) -> None:
    """
    缩容 Worker Pool。

    Args:
        hostname: Worker 主机名。
        n: 减少的工作进程数。

    Raises:
        AppException: 操作失败时抛出。
    """
    try:
        reply = celery_app.control.pool_shrink(n, destination=[hostname], reply=True, timeout=5)
        _check_pool_reply(reply, hostname, "pool_shrink")
    except AppException:
        raise
    except Exception:
        logger.exception("Failed to pool_shrink worker: {hostname}", hostname=hostname)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def _check_pool_reply(reply: list | None, hostname: str, action: str) -> None:
    """
    检查 pool_grow/pool_shrink 的响应。

    Celery control 命令在 reply=True 时返回 [{hostname: result}]。
    如果 worker 不支持（如 solo pool）或未响应，会返回空列表或 error。

    Args:
        reply: Celery control 命令的响应。
        hostname: Worker 主机名。
        action: 操作名称（用于日志）。

    Raises:
        AppException: Worker 未响应或返回错误时抛出。
    """
    if not reply:
        logger.warning("No reply from worker %s for %s, worker may not support pool resize", hostname, action)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)

    result = reply[0].get(hostname, {})
    if isinstance(result, dict) and "error" in result:
        logger.warning("Worker %s rejected %s: %s", hostname, action, result["error"])
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def add_consumer(hostname: str, queue: str) -> None:
    """
    让 Worker 监听新队列。

    Args:
        hostname: Worker 主机名。
        queue: 队列名称。

    Raises:
        AppException: 操作失败时抛出。
    """
    try:
        celery_app.control.add_consumer(queue, destination=[hostname])
    except Exception:
        logger.exception("Failed to add_consumer: {hostname} {queue}", hostname=hostname, queue=queue)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def cancel_consumer(hostname: str, queue: str) -> None:
    """
    让 Worker 停止监听队列。

    Args:
        hostname: Worker 主机名。
        queue: 队列名称。

    Raises:
        AppException: 操作失败时抛出。
    """
    try:
        celery_app.control.cancel_consumer(queue, destination=[hostname])
    except Exception:
        logger.exception("Failed to cancel_consumer: {hostname} {queue}", hostname=hostname, queue=queue)
        raise AppException(StatusCode.WORKER_CONTROL_FAILED)


def get_active_tasks(hostname: str) -> list[dict]:
    """
    获取 Worker 正在执行的任务列表。

    Args:
        hostname: Worker 主机名。

    Returns:
        活跃任务列表。
    """
    try:
        inspector = celery_app.control.inspect(destination=[hostname], timeout=CONTROL_TIMEOUT)
        result = inspector.active()
        if result and hostname in result:
            return result[hostname]
        return []
    except Exception:
        logger.exception("Failed to get active tasks: {hostname}", hostname=hostname)
        return []


def get_reserved_tasks(hostname: str) -> list[dict]:
    """
    获取 Worker 预取的待执行任务列表。

    Args:
        hostname: Worker 主机名。

    Returns:
        预留任务列表。
    """
    try:
        inspector = celery_app.control.inspect(destination=[hostname], timeout=CONTROL_TIMEOUT)
        result = inspector.reserved()
        if result and hostname in result:
            return result[hostname]
        return []
    except Exception:
        logger.exception("Failed to get reserved tasks: {hostname}", hostname=hostname)
        return []


def revoke_task(task_id: str, *, terminate: bool = False) -> None:
    """
    撤销一个 Celery 任务。

    Args:
        task_id: Celery 任务 ID。
        terminate: 是否终止正在运行的任务。

    Raises:
        AppException: 撤销失败时抛出。
    """
    try:
        celery_app.control.revoke(task_id, terminate=terminate, signal="SIGTERM")
    except Exception:
        logger.exception("Failed to revoke task: {task_id}", task_id=task_id)
        raise AppException(StatusCode.TASK_REVOKE_FAILED)
