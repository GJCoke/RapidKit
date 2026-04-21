"""
Redis Stream Consumer.

FastAPI 后台任务，消费 Redis Stream 中的 Celery 事件，委托 EventService 处理。

Author  : Claude
Date    : 2026-04-02
"""

import asyncio
import json
import os
import socket
from datetime import timedelta
from typing import TYPE_CHECKING

from plugin_worker.event_service import EventService
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.log import logger
from redis.asyncio import Redis
from redis.exceptions import ResponseError

if TYPE_CHECKING:
    from fastapi_sio_di import AsyncServer
    from rapidkit_core.leader_election import LeaderElection

STREAM_KEY = "celery:events"
CONSUMER_GROUP = "fastapi-consumers"
CONSUMER_NAME = f"consumer-{socket.gethostname()}-{os.getpid()}"
BLOCK_MS = 5000
HEARTBEAT_TIMEOUT = timedelta(seconds=90)
OFFLINE_CHECK_INTERVAL = 30

# 事件 → EventService 方法名映射
_EVENT_HANDLERS = {
    "worker.online": "handle_worker_online",
    "worker.offline": "handle_worker_offline",
    "worker.heartbeat": "handle_worker_heartbeat",
    "task.started": "handle_task_started",
    "task.success": "handle_task_success",
    "task.failure": "handle_task_failure",
    "task.retry": "handle_task_retry",
    "task.revoked": "handle_task_revoked",
}


async def _ensure_consumer_group(redis: Redis) -> None:
    """确保消费者组存在。"""
    try:
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        logger.info("Created consumer group '{group}' for stream '{stream}'", group=CONSUMER_GROUP, stream=STREAM_KEY)
    except ResponseError:
        pass  # BUSYGROUP: 消费者组已存在


async def consume_events(sio: "AsyncServer") -> None:
    """
    主消费循环：从 Redis Stream 读取事件，委托 EventService 处理。

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

                    handler_name = _EVENT_HANDLERS.get(event_type)
                    if handler_name:
                        try:
                            async with AsyncSessionLocal() as session:
                                service = EventService(session=session, sio=sio)
                                await getattr(service, handler_name)(data)
                                await session.commit()
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

        except asyncio.CancelledError:
            logger.info("Worker offline checker stopped.")
            break
        except Exception:
            logger.exception("Error in worker offline checker, retrying...")
            await asyncio.sleep(5)
