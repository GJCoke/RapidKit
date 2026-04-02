"""
Worker event service layer.

Handles Celery events from Redis Stream: persists to DB via CRUD, emits Socket.IO updates.

Author  : Claude
Date    : 2026-04-02
"""

from datetime import datetime, timedelta

from fastapi_sio_di import AsyncServer
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.log import logger
from src.domains.worker.crud import TaskResultCRUD, WorkerCRUD
from src.domains.worker.models import CeleryTaskResult, CeleryWorker
from src.utils.enums import TaskStatus, WorkerStatus

# 任务终态：已到达终态的任务不再被其他事件覆盖
_TERMINAL_STATES = {TaskStatus.SUCCESS, TaskStatus.FAILURE, TaskStatus.REVOKED}


class EventService:
    """处理 Celery 事件的业务逻辑层。"""

    def __init__(self, session: AsyncSession, sio: AsyncServer) -> None:
        self.session = session
        self.worker_crud = WorkerCRUD(CeleryWorker, session=session)
        self.task_crud = TaskResultCRUD(CeleryTaskResult, session=session)
        self.sio = sio

    # ==================== Socket.IO Helpers ====================

    async def _emit_worker_status(self, worker: CeleryWorker) -> None:
        """推送 Worker 状态到前端。"""
        try:
            await self.sio.emit(
                "worker:status",
                {
                    "hostname": worker.hostname,
                    "status": worker.status,
                    "concurrency": worker.concurrency,
                    "activeTaskCount": worker.active_task_count or 0,
                    "activeQueues": worker.active_queues or [],
                    "lastHeartbeat": worker.last_heartbeat.isoformat() if worker.last_heartbeat else "",
                    "processedCount": worker.processed_count or 0,
                },
                namespace="/worker",
            )
        except Exception:
            logger.warning("Failed to emit worker:status for {hostname}", hostname=worker.hostname)

    async def _emit_task_update(self, task: CeleryTaskResult, **extra: object) -> None:
        """推送任务状态更新到前端。"""
        try:
            payload = {
                "taskId": task.task_id,
                "taskName": task.task_name,
                "status": task.status,
                "workerHostname": task.worker_hostname,
                **extra,
            }
            await self.sio.emit("task:update", payload, namespace="/worker")
        except Exception:
            logger.warning("Failed to emit task:update for {task_id}", task_id=task.task_id)

    # ==================== Worker Events ====================

    async def handle_worker_online(self, data: dict) -> None:
        """处理 Worker 上线事件。"""
        now = datetime.now()
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
        """处理 Worker 离线事件。"""
        worker = await self.worker_crud.get_by_hostname(data["hostname"])
        if not worker:
            return
        worker.status = WorkerStatus.OFFLINE
        worker.active_task_count = 0
        worker.update_time = datetime.now()
        await self.session.flush()
        await self._emit_worker_status(worker)

    async def handle_worker_heartbeat(self, data: dict) -> None:
        """处理 Worker 心跳事件。"""
        worker = await self.worker_crud.get_by_hostname(data["hostname"])
        if not worker:
            return
        now = datetime.now()
        worker.last_heartbeat = now
        worker.update_time = now
        if worker.status == WorkerStatus.OFFLINE:
            worker.status = WorkerStatus.ONLINE
        await self.session.flush()
        await self._emit_worker_status(worker)

    # ==================== Task Events ====================

    async def handle_task_started(self, data: dict) -> None:
        """处理任务开始事件。"""
        now = datetime.now()
        task = await self.task_crud.upsert_by_task_id(
            data["task_id"],
            {
                "task_name": data.get("task_name", ""),
                "status": TaskStatus.STARTED,
                "worker_hostname": data.get("hostname", ""),
                "args": data.get("args", []),
                "kwargs": data.get("kwargs", {}),
                "started_at": now,
                "update_time": now,
            },
        )

        # 更新 Worker 活跃任务计数
        hostname = data.get("hostname", "")
        worker = await self._increment_active_tasks(hostname, delta=1) if hostname else None

        await self.session.flush()
        await self._emit_task_update(task)
        if worker:
            await self._emit_worker_status(worker)

    async def handle_task_success(self, data: dict) -> None:
        """处理任务成功事件。"""
        task = await self.task_crud.get_by_task_id(data["task_id"])
        now = datetime.now()

        if task:
            if task.status in _TERMINAL_STATES:
                logger.debug("Ignoring SUCCESS for terminal task {task_id}", task_id=data["task_id"])
                return
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
                },
            )

        # 更新 Worker 计数
        hostname = data.get("hostname", "")
        worker = await self._finish_task_on_worker(hostname) if hostname else None

        await self.session.flush()
        await self._emit_task_update(task, runtime=task.runtime)
        if worker:
            await self._emit_worker_status(worker)

    async def handle_task_failure(self, data: dict) -> None:
        """处理任务失败事件。"""
        task = await self.task_crud.get_by_task_id(data["task_id"])
        now = datetime.now()

        if task:
            if task.status in _TERMINAL_STATES:
                logger.debug("Ignoring FAILURE for terminal task {task_id}", task_id=data["task_id"])
                return
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
                },
            )

        # 更新 Worker 计数
        hostname = data.get("hostname", "")
        worker = await self._finish_task_on_worker(hostname) if hostname else None

        await self.session.flush()
        await self._emit_task_update(task, exception=data.get("exception", ""))
        if worker:
            await self._emit_worker_status(worker)

    async def handle_task_retry(self, data: dict) -> None:
        """处理任务重试事件。"""
        task = await self.task_crud.get_by_task_id(data["task_id"])
        if not task:
            return
        task.status = TaskStatus.RETRY
        task.retries = (task.retries or 0) + 1
        task.update_time = datetime.now()
        await self.session.flush()
        await self._emit_task_update(task)

    async def handle_task_revoked(self, data: dict) -> None:
        """处理任务撤销事件。"""
        task = await self.task_crud.get_by_task_id(data["task_id"])
        if not task:
            return
        now = datetime.now()
        task.status = TaskStatus.REVOKED
        task.finished_at = now
        task.update_time = now
        await self.session.flush()
        await self._emit_task_update(task)

    # ==================== Offline Check ====================

    async def check_offline_workers(self, threshold: timedelta) -> None:
        """检测并标记心跳超时的 Workers 为 OFFLINE。"""
        stale_workers = await self.worker_crud.get_offline_workers(threshold.total_seconds())
        for worker in stale_workers:
            worker.status = WorkerStatus.OFFLINE
            worker.active_task_count = 0
            worker.update_time = datetime.now()
            logger.info("Worker '{hostname}' marked as OFFLINE (heartbeat timeout)", hostname=worker.hostname)
            await self._emit_worker_status(worker)

    # ==================== Private Helpers ====================

    async def _increment_active_tasks(self, hostname: str, *, delta: int) -> CeleryWorker | None:
        """调整 Worker 的活跃任务计数。"""
        worker = await self.worker_crud.get_by_hostname(hostname)
        if worker:
            worker.active_task_count = max(0, (worker.active_task_count or 0) + delta)
        return worker

    async def _finish_task_on_worker(self, hostname: str) -> CeleryWorker | None:
        """任务完成时: 活跃任务 -1, 已处理 +1。"""
        worker = await self.worker_crud.get_by_hostname(hostname)
        if worker:
            worker.active_task_count = max(0, (worker.active_task_count or 0) - 1)
            worker.processed_count = (worker.processed_count or 0) + 1
        return worker
