"""
Celery Signal Handlers.

在 Worker 进程中注册 Celery Signal，捕获事件并写入 Redis Stream。

Author  : Claude
Date    : 2026-03-30
"""

import json
import platform
import threading
import time
from datetime import datetime

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

from src.core.config import settings

STREAM_KEY = "celery:events"
STREAM_MAXLEN = 10000
HEARTBEAT_INTERVAL = 30

_redis_client: redis.Redis | None = None


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
        "timestamp": datetime.now().isoformat(),
        "data": json.dumps(data, default=str),
    }
    r.xadd(STREAM_KEY, message, maxlen=STREAM_MAXLEN, approximate=True)


# ==================== Worker Signals ====================


@worker_ready.connect
def on_worker_ready(sender, **kwargs) -> None:  # type: ignore
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
def on_worker_shutdown(sender: celery.app.base.Celery, **kwargs) -> None:  # type: ignore
    """Worker 离线事件。"""
    _publish_event(
        "worker.offline",
        {"hostname": sender.hostname},  # type: ignore
    )


def _heartbeat_loop(hostname: str) -> None:
    """周期性发送心跳事件。"""
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        try:
            _publish_event(
                "worker.heartbeat",
                {"hostname": hostname},
            )
        except Exception:
            pass  # 心跳失败不影响 Worker 运行


# ==================== Task Signals ====================


@task_prerun.connect
def on_task_prerun(sender: celery.app.task.Task, task_id: str, args: tuple, kwargs: dict, **kw) -> None:  # type: ignore
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
def on_task_postrun(  # type: ignore
    sender: celery.app.task.Task,
    task_id: str,
    retval: object,
    state: str,
    **kw,
) -> None:
    """任务执行完成事件。"""
    event_type = "task.success" if state == "SUCCESS" else "task.failure"
    logs = getattr(sender, "_logs", None)
    _publish_event(
        event_type,
        {
            "task_id": task_id,
            "task_name": sender.name,
            "state": state,
            "retval": retval if state == "SUCCESS" else None,
            "runtime": sender.request.delivery_info.get("routing_key", None)
            if hasattr(sender.request, "delivery_info")
            else None,
            "hostname": sender.request.hostname or "",
            "logs": logs,
        },
    )


@task_failure.connect
def on_task_failure(  # type: ignore
    sender: celery.app.task.Task,
    task_id: str,
    exception: Exception,
    traceback: object,
    **kw,
) -> None:
    """任务失败事件（补充详细的异常和堆栈信息）。"""
    import traceback as tb_module

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
def on_task_retry(sender: celery.app.task.Task, request: object, reason: object, **kw) -> None:  # type: ignore
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
) -> None:  # type: ignore
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
