"""
Celery Signal Handlers.

在 Worker 进程中注册 Celery Signal，捕获事件并写入 Redis Stream。

Author  : Claude
Date    : 2026-03-30
"""

import json
import platform
import threading
import traceback as tb_module
from datetime import UTC, datetime

import celery
import celery.app.task
import redis
from celery.signals import (
    task_failure,
    task_postrun,
    task_prerun,
    task_retry,
    task_revoked,
    worker_ready,
    worker_shutdown,
)
from rapidkit_core.config import settings
from rapidkit_core.log import logger

STREAM_KEY = "celery:events"
STREAM_MAXLEN = 10000
HEARTBEAT_INTERVAL = 30

_redis_client: redis.Redis | None = None
_heartbeat_stop = threading.Event()


def _get_redis() -> redis.Redis:
    """获取同步 Redis 客户端（Worker 进程中使用）。"""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(str(settings.REDIS_URL), decode_responses=True)
    return _redis_client


def _publish_event(event_type: str, data: dict) -> None:
    """发布事件到 Redis Stream。"""
    r = _get_redis()
    message = {
        "event_type": event_type,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": json.dumps(data, default=str),
    }
    r.xadd(STREAM_KEY, message, maxlen=STREAM_MAXLEN, approximate=True)  # ty: ignore[invalid-argument-type]


# ==================== Worker Signals ====================


@worker_ready.connect
def on_worker_ready(sender, **kwargs) -> None:
    """Worker 上线事件。sender 是 Consumer 实例。"""
    worker = sender.controller  # Consumer.controller -> Worker
    hostname = worker.hostname
    _publish_event(
        "worker.online",
        {
            "hostname": hostname,
            "concurrency": worker.concurrency,
            "software_info": {
                "celery_version": celery.__version__,
                "python_version": platform.python_version(),
                "platform": platform.platform(),
            },
        },
    )

    # 启动心跳线程
    heartbeat_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(hostname,),
        daemon=True,
    )
    heartbeat_thread.start()


@worker_shutdown.connect
def on_worker_shutdown(sender, **kwargs) -> None:
    """Worker 离线事件。"""
    _heartbeat_stop.set()
    _publish_event(
        "worker.offline",
        {"hostname": sender.hostname},
    )


def _heartbeat_loop(hostname: str) -> None:
    """周期性发送心跳事件，通过 _heartbeat_stop 支持优雅退出。"""
    while not _heartbeat_stop.is_set():
        try:
            _publish_event(
                "worker.heartbeat",
                {"hostname": hostname},
            )
        except Exception:
            logger.warning("Heartbeat publish failed for {hostname}", hostname=hostname, exc_info=True)
        _heartbeat_stop.wait(HEARTBEAT_INTERVAL)


# ==================== Task Signals ====================


@task_prerun.connect
def on_task_prerun(sender: celery.app.task.Task, task_id: str, args: tuple, kwargs: dict, **kw) -> None:
    """任务开始执行事件。"""
    _publish_event(
        "task.started",
        {
            "task_id": task_id,
            "task_name": sender.name,
            "args": list(args) if args else [],
            "kwargs": kwargs or {},
            "hostname": sender.request.hostname or "",
        },
    )


@task_postrun.connect
def on_task_postrun(
    sender: celery.app.task.Task,
    task_id: str,
    retval: object,
    state: str,
    **kw,
) -> None:
    """任务执行完成事件。仅处理 SUCCESS，失败由 on_task_failure 负责。"""
    if state != "SUCCESS":
        return
    logs = getattr(sender, "_logs", None)
    _publish_event(
        "task.success",
        {
            "task_id": task_id,
            "task_name": sender.name,
            "state": state,
            "retval": retval,
            "runtime": kw.get("runtime"),
            "hostname": sender.request.hostname or "",
            "logs": logs,
        },
    )


@task_failure.connect
def on_task_failure(
    sender: celery.app.task.Task,
    task_id: str,
    exception: Exception,
    traceback: object,
    **kw,
) -> None:
    """任务失败事件（补充详细的异常和堆栈信息）。"""
    tb_str = ""
    if traceback is not None:
        try:
            tb_str = "".join(tb_module.format_tb(traceback))  # type: ignore
        except Exception:
            tb_str = str(traceback)

    logs = getattr(sender, "_logs", None)
    _publish_event(
        "task.failure",
        {
            "task_id": task_id,
            "task_name": sender.name,
            "exception": str(exception),
            "traceback": tb_str,
            "hostname": sender.request.hostname or "",
            "logs": logs,
        },
    )


@task_retry.connect
def on_task_retry(sender: celery.app.task.Task, request: object, reason: object, **kw) -> None:
    """任务重试事件。"""
    _publish_event(
        "task.retry",
        {
            "task_id": sender.request.id,
            "task_name": sender.name,
            "reason": str(reason),
            "hostname": sender.request.hostname or "",
        },
    )


@task_revoked.connect
def on_task_revoked(
    sender: celery.app.task.Task,
    request: object,
    terminated: bool,
    signum: object,
    expired: bool,
    **kw,
) -> None:
    """任务撤销事件。"""
    # task_revoked 信号中 request 参数携带正确的 task id，sender 是 Task 类而非实例
    task_id = getattr(request, "id", None) or (
        sender.request.id if hasattr(sender, "request") and sender.request else None
    )
    if not task_id:
        return

    _publish_event(
        "task.revoked",
        {
            "task_id": task_id,
            "terminated": terminated,
            "expired": expired,
        },
    )
