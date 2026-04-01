"""
Redis Stream Consumer.

FastAPI 后台任务，消费 Redis Stream 中的 Celery 事件，持久化到 PostgreSQL，推送 Socket.IO。

Author  : Claude
Date    : 2026-03-30
"""

import asyncio
import json
from datetime import datetime

from redis.asyncio import Redis

from src.core.database import AsyncSessionLocal, RedisManager
from src.core.log import logger
from src.domains.worker.models import CeleryTaskResult, CeleryWorker
from src.sio.app import socket
from src.utils.enums import TaskStatus, WorkerStatus

STREAM_KEY = "celery:events"
CONSUMER_GROUP = "fastapi-consumers"
CONSUMER_NAME = "fastapi-consumer-1"
BLOCK_MS = 5000
HEARTBEAT_TIMEOUT = 90
OFFLINE_CHECK_INTERVAL = 30

# 任务终态：已到达终态的任务不再被其他事件覆盖
_TERMINAL_STATES = {TaskStatus.REVOKED}


async def _ensure_consumer_group(redis: Redis) -> None:
    """确保消费者组存在。"""
    try:
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        logger.info("Created consumer group '{group}' for stream '{stream}'", group=CONSUMER_GROUP, stream=STREAM_KEY)
    except Exception:
        # 消费者组已存在
        pass


async def _handle_worker_online(data: dict) -> None:
    """处理 Worker 上线事件。"""
    hostname = data["hostname"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryWorker).filter(col(CeleryWorker.hostname) == hostname)
        result = await session.exec(statement)
        worker = result.first()

        now = datetime.now()
        if worker:
            worker.status = WorkerStatus.ONLINE
            worker.concurrency = data.get("concurrency", worker.concurrency)
            worker.software_info = data.get("software_info", worker.software_info)
            worker.last_heartbeat = now
            worker.update_time = now
        else:
            worker = CeleryWorker(
                hostname=hostname,
                status=WorkerStatus.ONLINE,
                concurrency=data.get("concurrency", 0),
                software_info=data.get("software_info", {}),
                last_heartbeat=now,
            )
            session.add(worker)

        await session.commit()

    await socket.emit(
        "worker:status",
        {
            "hostname": hostname,
            "status": WorkerStatus.ONLINE,
            "concurrency": data.get("concurrency", 0),
            "activeTaskCount": 0,
            "activeQueues": [],
            "lastHeartbeat": now.isoformat(),
        },
        namespace="/worker",
    )


async def _handle_worker_offline(data: dict) -> None:
    """处理 Worker 离线事件。"""
    hostname = data["hostname"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryWorker).filter(col(CeleryWorker.hostname) == hostname)
        result = await session.exec(statement)
        worker = result.first()

        if worker:
            worker.status = WorkerStatus.OFFLINE
            worker.active_task_count = 0
            worker.update_time = datetime.now()
            await session.commit()

    await socket.emit(
        "worker:status",
        {
            "hostname": hostname,
            "status": WorkerStatus.OFFLINE,
            "concurrency": 0,
            "activeTaskCount": 0,
            "activeQueues": [],
            "lastHeartbeat": datetime.now().isoformat(),
        },
        namespace="/worker",
    )


async def _handle_worker_heartbeat(data: dict) -> None:
    """处理 Worker 心跳事件。"""
    hostname = data["hostname"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryWorker).filter(col(CeleryWorker.hostname) == hostname)
        result = await session.exec(statement)
        worker = result.first()

        if worker:
            now = datetime.now()
            worker.last_heartbeat = now
            worker.update_time = now
            if worker.status == WorkerStatus.OFFLINE:
                worker.status = WorkerStatus.ONLINE
            await session.commit()


async def _handle_task_started(data: dict) -> None:
    """处理任务开始事件。"""
    task_id = data["task_id"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryTaskResult).filter(col(CeleryTaskResult.task_id) == task_id)
        result = await session.exec(statement)
        task = result.first()

        now = datetime.now()
        if task:
            task.status = TaskStatus.STARTED
            task.worker_hostname = data.get("hostname", "")
            task.started_at = now
            task.update_time = now
        else:
            task = CeleryTaskResult(
                task_id=task_id,
                task_name=data.get("task_name", ""),
                status=TaskStatus.STARTED,
                worker_hostname=data.get("hostname", ""),
                args=data.get("args", []),
                kwargs=data.get("kwargs", {}),
                started_at=now,
            )
            session.add(task)

        # 更新 Worker 的活跃任务计数
        hostname = data.get("hostname", "")
        if hostname:
            stmt = select(CeleryWorker).filter(col(CeleryWorker.hostname) == hostname)
            w_result = await session.exec(stmt)
            worker = w_result.first()
            if worker:
                worker.active_task_count = (worker.active_task_count or 0) + 1

        await session.commit()

    await socket.emit(
        "task:update",
        {
            "taskId": task_id,
            "taskName": data.get("task_name", ""),
            "status": TaskStatus.STARTED,
            "workerHostname": data.get("hostname", ""),
        },
        namespace="/worker",
    )


async def _handle_task_success(data: dict) -> None:
    """处理任务成功事件。"""
    task_id = data["task_id"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryTaskResult).filter(col(CeleryTaskResult.task_id) == task_id)
        result = await session.exec(statement)
        task = result.first()

        now = datetime.now()
        if task:
            # 已到达终态的任务不再被覆盖（如 REVOKED 不应被后续的 SUCCESS 覆盖）
            if task.status in _TERMINAL_STATES:
                return
            task.status = TaskStatus.SUCCESS
            task.finished_at = now
            task.result = data.get("retval")
            task.logs = data.get("logs")
            if task.started_at:
                task.runtime = (now - task.started_at).total_seconds()
            task.update_time = now
        else:
            task = CeleryTaskResult(
                task_id=task_id,
                task_name=data.get("task_name", ""),
                status=TaskStatus.SUCCESS,
                worker_hostname=data.get("hostname", ""),
                finished_at=now,
                result=data.get("retval"),
                logs=data.get("logs"),
            )
            session.add(task)

        # 更新 Worker 活跃任务计数和已处理计数
        hostname = data.get("hostname", "")
        if hostname:
            stmt = select(CeleryWorker).filter(col(CeleryWorker.hostname) == hostname)
            w_result = await session.exec(stmt)
            worker = w_result.first()
            if worker:
                worker.active_task_count = max(0, (worker.active_task_count or 0) - 1)
                worker.processed_count = (worker.processed_count or 0) + 1

        await session.commit()

    await socket.emit(
        "task:update",
        {
            "taskId": task_id,
            "taskName": data.get("task_name", ""),
            "status": TaskStatus.SUCCESS,
            "workerHostname": data.get("hostname", ""),
            "runtime": task.runtime if task else None,
        },
        namespace="/worker",
    )


async def _handle_task_failure(data: dict) -> None:
    """处理任务失败事件。"""
    task_id = data["task_id"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryTaskResult).filter(col(CeleryTaskResult.task_id) == task_id)
        result = await session.exec(statement)
        task = result.first()

        now = datetime.now()
        if task:
            # 已到达终态的任务不再被覆盖（如 REVOKED 不应被后续的 FAILURE 覆盖）
            if task.status in _TERMINAL_STATES:
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
            task = CeleryTaskResult(
                task_id=task_id,
                task_name=data.get("task_name", ""),
                status=TaskStatus.FAILURE,
                worker_hostname=data.get("hostname", ""),
                finished_at=now,
                exception=data.get("exception", ""),
                traceback=data.get("traceback", ""),
                logs=data.get("logs"),
            )
            session.add(task)

        # 更新 Worker 活跃任务计数和已处理计数
        hostname = data.get("hostname", "")
        if hostname:
            stmt = select(CeleryWorker).filter(col(CeleryWorker.hostname) == hostname)
            w_result = await session.exec(stmt)
            worker = w_result.first()
            if worker:
                worker.active_task_count = max(0, (worker.active_task_count or 0) - 1)
                worker.processed_count = (worker.processed_count or 0) + 1

        await session.commit()

    await socket.emit(
        "task:update",
        {
            "taskId": task_id,
            "taskName": data.get("task_name", ""),
            "status": TaskStatus.FAILURE,
            "workerHostname": data.get("hostname", ""),
            "exception": data.get("exception", ""),
        },
        namespace="/worker",
    )


async def _handle_task_retry(data: dict) -> None:
    """处理任务重试事件。"""
    task_id = data["task_id"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryTaskResult).filter(col(CeleryTaskResult.task_id) == task_id)
        result = await session.exec(statement)
        task = result.first()

        if task:
            task.status = TaskStatus.RETRY
            task.retries = (task.retries or 0) + 1
            task.update_time = datetime.now()
            await session.commit()

    await socket.emit(
        "task:update",
        {
            "taskId": task_id,
            "taskName": data.get("task_name", ""),
            "status": TaskStatus.RETRY,
            "workerHostname": data.get("hostname", ""),
        },
        namespace="/worker",
    )


async def _handle_task_revoked(data: dict) -> None:
    """处理任务撤销事件。"""
    task_id = data["task_id"]

    async with AsyncSessionLocal() as session:
        from sqlmodel import col, select

        statement = select(CeleryTaskResult).filter(col(CeleryTaskResult.task_id) == task_id)
        result = await session.exec(statement)
        task = result.first()

        if task:
            task.status = TaskStatus.REVOKED
            task.finished_at = datetime.now()
            task.update_time = datetime.now()
            await session.commit()

    await socket.emit(
        "task:update",
        {
            "taskId": task_id,
            "status": TaskStatus.REVOKED,
        },
        namespace="/worker",
    )


# 事件处理器映射
_EVENT_HANDLERS = {
    "worker.online": _handle_worker_online,
    "worker.offline": _handle_worker_offline,
    "worker.heartbeat": _handle_worker_heartbeat,
    "task.started": _handle_task_started,
    "task.success": _handle_task_success,
    "task.failure": _handle_task_failure,
    "task.retry": _handle_task_retry,
    "task.revoked": _handle_task_revoked,
}


async def consume_events() -> None:
    """
    主消费循环：从 Redis Stream 读取事件并分发处理。

    使用 XREADGROUP 进行消费者组读取，处理完成后 XACK 确认。
    """
    redis = RedisManager.client()
    await _ensure_consumer_group(redis)

    logger.info("Event stream consumer started.")

    while True:
        try:
            messages = await redis.xreadgroup(
                CONSUMER_GROUP,
                CONSUMER_NAME,
                {STREAM_KEY: ">"},
                count=10,
                block=BLOCK_MS,
            )

            if not messages:
                continue

            for stream, entries in messages:
                for message_id, fields in entries:
                    event_type = fields.get("event_type", "")
                    raw_data = fields.get("data", "{}")

                    try:
                        data = json.loads(raw_data)
                    except json.JSONDecodeError:
                        logger.warning("Invalid JSON in event data: {data}", data=raw_data)
                        await redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
                        continue

                    handler = _EVENT_HANDLERS.get(event_type)
                    if handler:
                        try:
                            await handler(data)
                        except Exception:
                            logger.exception(
                                "Error handling event {event_type}: {data}",
                                event_type=event_type,
                                data=data,
                            )
                    else:
                        logger.debug("Unknown event type: {event_type}", event_type=event_type)

                    await redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)

        except asyncio.CancelledError:
            logger.info("Event stream consumer stopped.")
            break
        except Exception:
            logger.exception("Error in event stream consumer, retrying in 5s...")
            await asyncio.sleep(5)


async def check_worker_offline() -> None:
    """
    定时检测 Worker 离线。

    每 30 秒扫描一次，将心跳超过 90 秒的 Worker 标记为 OFFLINE。
    """
    logger.info("Worker offline checker started.")

    while True:
        try:
            await asyncio.sleep(OFFLINE_CHECK_INTERVAL)

            async with AsyncSessionLocal() as session:
                from datetime import timedelta

                from sqlmodel import col, select

                cutoff = datetime.now() - timedelta(seconds=HEARTBEAT_TIMEOUT)
                statement = select(CeleryWorker).filter(
                    col(CeleryWorker.status) == WorkerStatus.ONLINE,
                    col(CeleryWorker.last_heartbeat) < cutoff,
                )
                result = await session.exec(statement)
                stale_workers = list(result.all())

                for worker in stale_workers:
                    worker.status = WorkerStatus.OFFLINE
                    worker.active_task_count = 0
                    worker.update_time = datetime.now()

                    await socket.emit(
                        "worker:status",
                        {
                            "hostname": worker.hostname,
                            "status": WorkerStatus.OFFLINE,
                            "concurrency": worker.concurrency,
                            "activeTaskCount": 0,
                            "activeQueues": worker.active_queues,
                            "lastHeartbeat": worker.last_heartbeat.isoformat(),
                        },
                        namespace="/worker",
                    )

                    logger.info(
                        "Worker '{hostname}' marked as OFFLINE (heartbeat timeout)",
                        hostname=worker.hostname,
                    )

                if stale_workers:
                    await session.commit()

        except asyncio.CancelledError:
            logger.info("Worker offline checker stopped.")
            break
        except Exception:
            logger.exception("Error in worker offline checker, retrying...")
            await asyncio.sleep(5)
