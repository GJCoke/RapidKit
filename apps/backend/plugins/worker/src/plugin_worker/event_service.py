"""
Worker event service layer.

Handles Celery events from Redis Stream: persists to DB via CRUD, emits Socket.IO updates.

Author  : Claude
Date    : 2026-04-02
"""

from datetime import UTC, timedelta

from fastapi_sio_di import AsyncServer
from rapidkit_common.audit import AuditMetadata, AuditRecord
from rapidkit_common.enums import TaskStatus, WorkerStatus
from rapidkit_common.events import TaskFailedEvent, TaskSucceededEvent, WorkerOfflineEvent
from rapidkit_common.protocols.audit import AuditWriter
from rapidkit_core.config import settings
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7
from rapidkit_framework.audit import AuditActorType, AuditResult, AuditSource
from rapidkit_framework.events import event_bus
from rapidkit_framework.services import get_service_optional
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_worker.crud import TaskResultCRUD, WorkerCRUD
from plugin_worker.inventory import is_current_worker
from plugin_worker.models import CeleryTaskResult, CeleryWorker

logger = get_plugin_logger("Worker")

# 任务终态
_TERMINAL_STATES = {TaskStatus.SUCCESS, TaskStatus.FAILURE, TaskStatus.REVOKED}


class EventService:
    """处理 Celery 事件的业务逻辑层。"""

    def __init__(self, session: AsyncSession, sio: AsyncServer) -> None:
        self.session = session
        self.worker_crud = WorkerCRUD(session)
        self.task_crud = TaskResultCRUD(session)
        self.sio = sio

    async def _audit_execution(self, task, data, result):
        if not settings.AUDIT_V2_ENABLED:
            return
        writer = get_service_optional(AuditWriter)
        if writer is None:
            raise RuntimeError("Audit writer required for structured task auditing")
        record = AuditRecord(
            action="task.execute",
            actor_type=AuditActorType.SYSTEM,
            actor_name=task.task_name,
            source=AuditSource.SYSTEM,
            resource_type="task",
            resource_id=task.task_id,
            resource_name=task.task_name,
            result=AuditResult(result),
            correlation_id=data.get("audit_correlation_id") or task.task_id,
            duration_ms=task.runtime * 1000 if task.runtime is not None else None,
            metadata=AuditMetadata(
                task_id=task.task_id,
                attempt=data.get("attempt", task.retries),
                initiated_by=data.get("audit_initiated_by"),
            ),
        )
        if result == "failure":
            record.error_key = "audit.taskExecutionFailed"
        await writer.append_in_transaction(self.session, record)

    # ==================== Socket.IO Helpers ====================

    async def _emit_worker_status(self, worker: CeleryWorker) -> None:
        if not is_current_worker(worker.hostname):
            return
        payload = {
            "hostname": worker.hostname,
            "status": worker.status,
            "concurrency": worker.concurrency,
            "activeTaskCount": worker.active_task_count or 0,
            "activeQueues": worker.active_queues or [],
            "lastHeartbeat": worker.last_heartbeat.replace(tzinfo=UTC).isoformat() if worker.last_heartbeat else "",
            "processedCount": worker.processed_count or 0,
        }
        try:
            await self.sio.emit("worker:status", payload, namespace="/worker")
            await self.sio.emit("dashboard:worker_status", payload, namespace="/dashboard")
        except Exception:
            logger.warning("Failed to emit worker:status for {hostname}", hostname=worker.hostname)

    async def _emit_task_update(self, task: CeleryTaskResult, **extra: object) -> None:
        try:
            payload = {
                "taskId": task.task_id,
                "taskName": task.task_name,
                "status": task.status,
                "workerHostname": task.worker_hostname,
                **extra,
            }
            await self.sio.emit("task:update", payload, namespace="/worker")
            if task.status in _TERMINAL_STATES:
                dashboard_payload = {
                    **payload,
                    "runtime": task.runtime,
                    "finishedAt": task.finished_at.isoformat() if task.finished_at else "",
                }
                await self.sio.emit("dashboard:task_completed", dashboard_payload, namespace="/dashboard")
        except Exception:
            logger.warning("Failed to emit task:update for {task_id}", task_id=task.task_id)

    # ==================== Worker Events ====================

    async def handle_worker_online(self, data: dict) -> None:
        now = timezone.now()
        worker = await self.worker_crud.upsert_by_hostname(
            data["hostname"],
            {
                "status": WorkerStatus.ONLINE,
                "concurrency": data.get("concurrency", 0),
                "software_info": data.get("software_info", {}),
                "last_heartbeat": now,
                "update_time": now,
            },
        )
        await self.session.flush()
        await self._emit_worker_status(worker)

    async def handle_worker_offline(self, data: dict) -> None:
        worker = await self.worker_crud.get_by_hostname(data["hostname"])
        if not worker:
            return
        worker.status = WorkerStatus.OFFLINE
        worker.active_task_count = 0
        worker.update_time = timezone.now()
        await self.session.flush()
        await self._emit_worker_status(worker)
        if not is_current_worker(worker.hostname):
            return
        event_bus.fire_and_forget(
            WorkerOfflineEvent(
                event_id=str(uuid7()),
                occurred_at=worker.update_time,
                worker_hostname=worker.hostname,
            )
        )

    async def handle_worker_heartbeat(self, data: dict) -> None:
        worker = await self.worker_crud.get_by_hostname(data["hostname"])
        if not worker:
            return
        now = timezone.now()
        worker.last_heartbeat = now
        worker.update_time = now
        if worker.status == WorkerStatus.OFFLINE:
            worker.status = WorkerStatus.ONLINE
        await self.session.flush()
        await self._emit_worker_status(worker)

    # ==================== Task Events ====================

    async def handle_task_started(self, data: dict) -> None:
        existing = await self.task_crud.get_by_task_id(data["task_id"], for_update=True)
        attempt = data.get("attempt", existing.retries if existing else 0)
        if existing is not None:
            if attempt < existing.retries or (
                attempt == existing.retries and existing.status in _TERMINAL_STATES | {TaskStatus.STARTED}
            ):
                return
        now = timezone.now()
        task = await self.task_crud.upsert_by_task_id(
            data["task_id"],
            {
                "task_name": data.get("task_name", ""),
                "status": TaskStatus.STARTED,
                "worker_hostname": data.get("hostname", ""),
                "args": data.get("args", []),
                "kwargs": data.get("kwargs", {}),
                "started_at": now,
                "retries": attempt,
                "finished_at": None,
                "runtime": None,
                "update_time": now,
            },
        )
        hostname = data.get("hostname", "")
        worker = await self._increment_active_tasks(hostname, delta=1) if hostname else None
        await self.session.flush()
        await self._emit_task_update(task)
        if worker:
            await self._emit_worker_status(worker)

    async def handle_task_success(self, data: dict) -> None:
        task = await self.task_crud.get_by_task_id(data["task_id"], for_update=True)
        now = timezone.now()
        if task:
            attempt = data.get("attempt", task.retries)
            if attempt < task.retries or (attempt == task.retries and task.status in _TERMINAL_STATES):
                return
            if attempt > task.retries:
                task.started_at = None
            task.retries = attempt
            task.status = TaskStatus.SUCCESS
            task.finished_at = now
            task.result = data.get("retval")
            task.logs = data.get("logs")
            if task.started_at:
                task.runtime = (now - task.started_at).total_seconds()
            task.update_time = now
        else:
            task = await self.task_crud.upsert_by_task_id(
                data["task_id"],
                {
                    "task_name": data.get("task_name", ""),
                    "status": TaskStatus.SUCCESS,
                    "worker_hostname": data.get("hostname", ""),
                    "finished_at": now,
                    "result": data.get("retval"),
                    "logs": data.get("logs"),
                    "retries": data.get("attempt", 0),
                },
            )
        hostname = data.get("hostname", "")
        worker = await self._finish_task_on_worker(hostname) if hostname else None
        await self.session.flush()
        await self._emit_task_update(task, runtime=task.runtime)
        if worker:
            await self._emit_worker_status(worker)
        await self._audit_execution(task, data, "success")
        event_bus.fire_and_forget(
            TaskSucceededEvent(
                event_id=str(uuid7()),
                occurred_at=now,
                task_id=str(task.task_id),
                task_name=task.task_name,
                runtime=task.runtime,
            )
        )

    async def handle_task_failure(self, data: dict) -> None:
        task = await self.task_crud.get_by_task_id(data["task_id"], for_update=True)
        now = timezone.now()
        if task:
            attempt = data.get("attempt", task.retries)
            if attempt < task.retries or (attempt == task.retries and task.status in _TERMINAL_STATES):
                return
            if attempt > task.retries:
                task.started_at = None
            task.retries = attempt
            task.status = TaskStatus.FAILURE
            task.finished_at = now
            task.exception = data.get("exception", "")
            task.traceback = data.get("traceback", "")
            task.logs = data.get("logs")
            if task.started_at:
                task.runtime = (now - task.started_at).total_seconds()
            task.update_time = now
        else:
            task = await self.task_crud.upsert_by_task_id(
                data["task_id"],
                {
                    "task_name": data.get("task_name", ""),
                    "status": TaskStatus.FAILURE,
                    "worker_hostname": data.get("hostname", ""),
                    "finished_at": now,
                    "exception": data.get("exception", ""),
                    "traceback": data.get("traceback", ""),
                    "logs": data.get("logs"),
                    "retries": data.get("attempt", 0),
                },
            )
        hostname = data.get("hostname", "")
        worker = await self._finish_task_on_worker(hostname) if hostname else None
        await self.session.flush()
        await self._emit_task_update(task, exception=data.get("exception", ""))
        if worker:
            await self._emit_worker_status(worker)
        await self._audit_execution(task, data, "failure")
        event_bus.fire_and_forget(
            TaskFailedEvent(
                event_id=str(uuid7()),
                occurred_at=now,
                task_id=str(task.task_id),
                task_name=task.task_name,
                error_summary=data.get("exception", "")[:500],
            )
        )

    async def handle_task_retry(self, data: dict) -> None:
        task = await self.task_crud.get_by_task_id(data["task_id"], for_update=True)
        if not task:
            return
        attempt = data.get("attempt", task.retries)
        if attempt < task.retries or task.status in _TERMINAL_STATES:
            return
        if task.started_at:
            task.runtime = (timezone.now() - task.started_at).total_seconds()
        await self._audit_execution(task, data, "failure")
        task.status = TaskStatus.RETRY
        task.retries = attempt + 1
        task.update_time = timezone.now()
        await self.session.flush()
        await self._emit_task_update(task)

    async def handle_task_revoked(self, data: dict) -> None:
        task = await self.task_crud.get_by_task_id(data["task_id"], for_update=True)
        if not task:
            return
        attempt = data.get("attempt", task.retries)
        if attempt < task.retries or (attempt == task.retries and task.status in _TERMINAL_STATES):
            return
        now = timezone.now()
        task.status = TaskStatus.REVOKED
        task.retries = attempt
        task.finished_at = now
        task.update_time = now
        await self.session.flush()
        await self._audit_execution(task, data, "failure")
        await self._emit_task_update(task)

    # ==================== Offline Check ====================

    async def check_offline_workers(self, threshold: timedelta) -> None:
        stale_workers = await self.worker_crud.get_offline_workers(threshold.total_seconds())
        for worker in stale_workers:
            worker.status = WorkerStatus.OFFLINE
            worker.active_task_count = 0
            worker.update_time = timezone.now()
            logger.info("Worker '{hostname}' marked as OFFLINE (heartbeat timeout)", hostname=worker.hostname)
            await self._emit_worker_status(worker)

    # ==================== Private Helpers ====================

    async def _increment_active_tasks(self, hostname: str, *, delta: int) -> CeleryWorker | None:
        worker = await self.worker_crud.get_by_hostname(hostname)
        if worker:
            worker.active_task_count = max(0, (worker.active_task_count or 0) + delta)
        return worker

    async def _finish_task_on_worker(self, hostname: str) -> CeleryWorker | None:
        worker = await self.worker_crud.get_by_hostname(hostname)
        if worker:
            worker.active_task_count = max(0, (worker.active_task_count or 0) - 1)
            worker.processed_count = (worker.processed_count or 0) + 1
        return worker
