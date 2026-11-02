"""
Celery Signal Handlers.

在 Worker 进程中注册 Celery Signal，捕获事件并写入 Redis Stream。

Author  : Claude
Date    : 2026-03-30
"""

import os
import platform
import threading
import traceback as tb_module
from types import TracebackType

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
from rapidkit_core import runtime_state
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.nanoid import publication_request_id, request_id_scope
from rapidkit_core.timezone import timezone
from rapidkit_framework.identity import identity_from_headers, identity_headers
from redis.backoff import NoBackoff
from redis.retry import Retry

from src.queues.event_stream import STREAM_KEY, InvalidEvent, encode_event

HEARTBEAT_INTERVAL = 30

_redis_client: redis.Redis | None = None
_heartbeat_stop = threading.Event()
_publication_counts = {"successes": 0, "failures": 0}
_publication_lock = threading.Lock()
_missed_since_success = 0


def _reset_publication_process() -> None:
    global _publication_lock, _publication_counts, _missed_since_success, _redis_client
    _publication_lock = threading.Lock()
    _publication_counts = {"successes": 0, "failures": 0}
    _missed_since_success = 0
    _redis_client = None


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_reset_publication_process)


def publication_status() -> dict[str, int]:
    """Process-local evidence, available even while Redis is disconnected."""
    with _publication_lock:
        return dict(_publication_counts)


def _get_redis() -> redis.Redis:
    """获取同步 Redis 客户端（Worker 进程中使用）。"""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            str(settings.REDIS_URL),
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry=Retry(NoBackoff(), 0),
        )
    return _redis_client


def _publish_event(event_type: str, data: dict) -> bool:
    """发布事件到 Redis Stream。"""
    global _missed_since_success
    published = True
    with request_id_scope(str(data.get("request_id") or "-")):
        bound = logger.bind(
            task_id=data.get("task_id"),
            task_name=data.get("task_name"),
            attempt=data.get("attempt"),
            correlation_id=data.get("audit_correlation_id") or data.get("correlation_id"),
        )
        try:
            message = encode_event(event_type, data, timezone.now().isoformat())
            _get_redis().xadd(STREAM_KEY, message)  # ty: ignore[invalid-argument-type]
        except Exception as exc:
            published = False
            runtime_state.increment("task_event_publish_failed")
            with _publication_lock:
                _publication_counts["failures"] += 1
                _missed_since_success += 1
                failures = _missed_since_success
            bound.bind(
                event="task.event.publish_failed",
                component="task_event_publisher",
                consecutive_failures=failures,
                reason_code="invalid_event" if isinstance(exc, InvalidEvent) else "publish_failed",
            ).opt(exception=exc).error("Observation publication failed; execution result unchanged")
        else:
            runtime_state.increment("task_event_published")
            with _publication_lock:
                _publication_counts["successes"] += 1
                missed, _missed_since_success = _missed_since_success, 0
            if missed:
                bound.bind(
                    event="task.event.publisher_resumed",
                    consecutive_failures=missed,
                    reason_code="unrecovered_publication_gap",
                ).warning("Observation publication resumed; missed events are not recovered")
        if event_type != "worker.heartbeat":
            bound.bind(event="task.lifecycle", reason_code=event_type).info(
                "Task observation publication {}", "succeeded" if published else "failed"
            )
    return published


# ==================== Worker Signals ====================


@worker_ready.connect
def on_worker_ready(sender, **kwargs) -> None:
    """Worker 上线事件。sender 是 Consumer 实例。"""
    worker = sender.controller  # Consumer.controller -> Worker
    from src.runtime_metrics import start_process_exporter

    start_process_exporter()
    hostname = worker.hostname
    _heartbeat_stop.clear()
    _publish_event(
        "worker.online",
        {
            "hostname": hostname,
            "group_name": settings.CELERY_WORKER_GROUP,
            "deployment_id": settings.CELERY_WORKER_DEPLOYMENT,
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
                {
                    "hostname": hostname,
                    "group_name": settings.CELERY_WORKER_GROUP,
                    "deployment_id": settings.CELERY_WORKER_DEPLOYMENT,
                },
            )
        except Exception:
            logger.opt(exception=True).warning("Heartbeat publish failed for {hostname}", hostname=hostname)
        _heartbeat_stop.wait(HEARTBEAT_INTERVAL)


def _request_identity(request) -> dict[str, object]:
    headers = getattr(request, "headers", None)
    if headers is None:
        headers = getattr(request, "request_dict", None)
    if headers is None:
        headers = {}
        request.headers = headers
    values: dict[str, object] = dict(identity_headers(identity_from_headers(headers)))
    request_id = headers.get("request_id")
    if not isinstance(request_id, str) or not request_id:
        request_id = publication_request_id({})
        headers["request_id"] = request_id
    values["request_id"] = request_id
    for key in ("audit_correlation_id", "audit_initiated_by", "correlation_id"):
        if headers.get(key) is not None:
            values[key] = headers[key]
    values["attempt"] = getattr(request, "retries", 0) or 0
    return values


# ==================== Task Signals ====================


@task_prerun.connect
def on_task_prerun(sender: celery.app.task.Task, task_id: str, args: tuple, kwargs: dict, **kw) -> None:
    """任务开始执行事件。"""
    _publish_event(
        "task.started",
        {
            **_request_identity(sender.request),
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
            **_request_identity(sender.request),
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
    frames = []
    if isinstance(traceback, TracebackType):
        try:
            frames = [
                {"filename": frame.filename, "name": frame.name, "lineno": frame.lineno}
                for frame in tb_module.extract_tb(traceback)
            ]
        except Exception:
            pass

    logs = getattr(sender, "_logs", None)
    _publish_event(
        "task.failure",
        {
            **_request_identity(sender.request),
            "task_id": task_id,
            "task_name": sender.name,
            "exception_type": type(exception).__name__,
            "traceback_frames": frames,
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
            **_request_identity(request),
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
            **_request_identity(request),
            "task_id": task_id,
            "task_name": sender.name,
            "terminated": terminated,
            "expired": expired,
        },
    )
