"""
Redis Stream Consumer.

FastAPI 后台任务，消费 Redis Stream 中的 Celery 事件，委托 EventService 处理。

Author  : Claude
Date    : 2026-04-02
"""

import asyncio
import os
import socket
import time
from datetime import timedelta
from typing import TYPE_CHECKING

from plugin_worker.event_service import EventService
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.log import component_failed, component_recovered, logger
from rapidkit_core.transaction import run_after_commit_hooks
from redis.asyncio import Redis
from redis.exceptions import ResponseError

if TYPE_CHECKING:
    from fastapi_sio_di import AsyncServer
    from rapidkit_core.leader_election import LeaderElection

from src.queues.event_stream import CONSUMER_GROUP, STREAM_KEY, process_message, safe_trim

CONSUMER_NAME = f"consumer-{socket.gethostname()}-{os.getpid()}"
BLOCK_MS = 5000
PENDING_IDLE_MS = 60_000
HEARTBEAT_TIMEOUT = timedelta(seconds=90)
OFFLINE_CHECK_INTERVAL = 30


async def _ensure_consumer_group(redis: Redis) -> None:
    """确保消费者组存在。"""
    try:
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        logger.info("Created consumer group '{group}' for stream '{stream}'", group=CONSUMER_GROUP, stream=STREAM_KEY)
    except ResponseError as exc:
        if not str(exc).startswith("BUSYGROUP"):
            raise


async def consume_events(sio: "AsyncServer") -> None:
    """
    主消费循环：从 Redis Stream 读取事件，委托 EventService 处理。

    接管空闲的待确认事件，再读取新事件；仅在事务提交成功后确认。
    """
    redis = RedisManager.client()
    initialized, claim_cursor, last_maintenance = False, "0-0", float("-inf")
    logger.info("Event stream consumer started.")
    while True:
        try:
            if not initialized:
                await _ensure_consumer_group(redis)
                initialized = True
            claim_cursor, claimed, *deleted = await redis.xautoclaim(
                STREAM_KEY,
                CONSUMER_GROUP,
                CONSUMER_NAME,
                min_idle_time=PENDING_IDLE_MS,
                start_id=claim_cursor,
                count=10,
            )
            if deleted and deleted[0]:
                logger.bind(
                    event="task.event.gap", reason_code="pending_source_missing", consecutive_failures=len(deleted[0])
                ).error("Pending observation payloads missing")
            # Reserve a fresh-message budget even under permanent pending backlog.
            fresh = await redis.xreadgroup(
                CONSUMER_GROUP, CONSUMER_NAME, {STREAM_KEY: ">"}, count=10, block=1 if claimed else BLOCK_MS
            )
            batches = [*(fresh or []), (STREAM_KEY, claimed)]
            for _, entries in batches:
                for message_id, fields in entries:
                    try:
                        await process_message(redis, message_id, fields, sio, session_factory=AsyncSessionLocal)
                        component_recovered("task_event_persistence")
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        component_failed("task_event_persistence", exc)
            if time.monotonic() - last_maintenance >= 60:
                last_maintenance = time.monotonic()
                result = await safe_trim(redis)
                if result["reason"] == "group_mismatch":
                    logger.bind(event="task.event.trim_skipped", reason_code="group_mismatch").warning(
                        "Observation trim refused; reconcile registered consumer groups"
                    )
            component_recovered("task_event_consumer")
        except asyncio.CancelledError:
            logger.info("Event stream consumer stopped.")
            break
        except Exception as exc:
            if isinstance(exc, ResponseError) and "NOGROUP" in str(exc):
                initialized = False
            component_failed("task_event_consumer", exc)
            await asyncio.sleep(5)


async def check_worker_offline(sio: "AsyncServer", leader: "LeaderElection | None" = None) -> None:
    """
    定时检测 Worker 离线（仅 leader 实例执行）。

    每 30 秒扫描一次，将心跳超过 90 秒的 Worker 标记为 OFFLINE。
    """
    logger.info("Worker offline checker started.")

    while True:
        try:
            await asyncio.sleep(OFFLINE_CHECK_INTERVAL)

            if leader and not leader.is_leader:
                continue

            async with AsyncSessionLocal() as session:
                service = EventService(session=session, sio=sio)
                await service.check_offline_workers(HEARTBEAT_TIMEOUT)
                await session.commit()
                await run_after_commit_hooks(session)

        except asyncio.CancelledError:
            logger.info("Worker offline checker stopped.")
            break
        except Exception:
            logger.exception("Error in worker offline checker, retrying...")
            await asyncio.sleep(5)
