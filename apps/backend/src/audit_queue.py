"""Redis-backed audit delivery with commit-before-ack and local outage fallback.

Author : Codex
Date   : 2026-10-23
"""

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import cast

from rapidkit_common.audit import AuditRecord
from rapidkit_core.leader_election import LeaderElection
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from redis.exceptions import RedisError

logger = get_plugin_logger("AuditQueue")
PENDING_KEY = "audit:pending"
PROCESSING_KEY = "audit:processing"
LEADER_KEY = "leader:audit-consumer"


class RedisAuditQueue:
    def __init__(
        self,
        redis: AsyncRedisClient,
        handler: Callable[[list[AuditRecord]], Awaitable[None]],
        *,
        batch_size: int,
        flush_interval: float,
        on_state: Callable[[str, int], None] | None = None,
    ) -> None:
        if batch_size <= 0 or flush_interval <= 0:
            raise ValueError("batch_size and flush_interval must be positive")
        self._redis = redis
        self._handler = handler
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._on_state = on_state
        self._leader = LeaderElection(redis, LEADER_KEY)
        self._fallback: asyncio.Queue[str] = asyncio.Queue()
        self._retry: str | None = None
        self._lock = asyncio.Lock()
        self._wake = asyncio.Event()
        self._consumer: asyncio.Task | None = None

    def _notify(self, event: str, count: int) -> None:
        if self._on_state is not None:
            try:
                self._on_state(event, count)
            except Exception:
                logger.exception("Audit delivery state callback failed")

    @property
    def _fallback_size(self) -> int:
        return self._fallback.qsize() + (self._retry is not None)

    async def _push(self, payload: str) -> int:
        # A blackholed Redis must not stall the HTTP response indefinitely.
        async with asyncio.timeout(2):
            return await self._redis.rpush(PENDING_KEY, payload)

    async def put(self, record: AuditRecord) -> None:
        snapshot = record.model_dump(mode="json")
        # targets is deliberately excluded from regular API/model dumps.
        snapshot["targets"] = [target.model_dump(mode="json") for target in record.targets]
        payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
        try:
            pending = await self._push(payload)
        except asyncio.CancelledError:
            self._fallback.put_nowait(payload)
            self._notify("queued", 1)
            self._notify("buffer_size", self._fallback_size)
            logger.warning("Audit enqueue cancelled; snapshot retained in memory for recovery")
            raise
        except RedisError, TimeoutError:
            self._fallback.put_nowait(payload)
            pending = 0
            self._notify("failed", 1)
            logger.warning("Redis unavailable; audit retained in memory (buffer_size={})", self._fallback_size)
        self._notify("queued", 1)
        self._notify("buffer_size", pending + self._fallback_size)
        if pending >= self._batch_size:
            self._wake.set()

    async def start(self) -> None:
        if self._consumer is not None:
            return
        await self._leader.start()
        self._consumer = asyncio.create_task(self._consume())

    async def _restore_fallback(self) -> None:
        while self._retry is not None or not self._fallback.empty():
            if self._retry is None:
                self._retry = self._fallback.get_nowait()
            self._notify("retried", 1)
            await self._push(self._retry)
            self._fallback.task_done()
            self._retry = None

    async def _report_size(self) -> None:
        try:
            async with asyncio.timeout(2):
                pending, processing = await asyncio.gather(
                    cast(Awaitable[int], self._redis.llen(PENDING_KEY)),
                    cast(Awaitable[int], self._redis.llen(PROCESSING_KEY)),
                )
            size = pending + processing + self._fallback_size
        except RedisError, TimeoutError:
            size = self._fallback_size
        self._notify("buffer_size", size)

    async def flush(self) -> None:
        async with self._lock:
            payloads = []
            try:
                # Every instance restores its own fallback, including standby consumers.
                await self._restore_fallback()
                while self._leader.is_leader:
                    async with asyncio.timeout(2):
                        payloads = await self._redis.lrange(PROCESSING_KEY, 0, self._batch_size - 1)
                    if not payloads:
                        for _ in range(self._batch_size):
                            if not self._leader.is_leader:
                                break
                            async with asyncio.timeout(2):
                                payload = await self._redis.lmove(PENDING_KEY, PROCESSING_KEY, "LEFT", "RIGHT")
                            if payload is None:
                                break
                            payloads.append(payload)
                    if not payloads or not self._leader.is_leader:
                        break
                    try:
                        await self._handler([AuditRecord.model_validate_json(payload) for payload in payloads])
                    except asyncio.CancelledError:
                        self._notify("retried", len(payloads))
                        raise
                    except Exception as exc:
                        self._notify("failed", len(payloads))
                        self._notify("retried", len(payloads))
                        logger.warning(
                            "Audit database delivery failed ({}); {} records retained",
                            type(exc).__name__,
                            len(payloads),
                        )
                        break
                    # A changed lease can replay this batch safely; never ACK an uncommitted batch.
                    if not self._leader.is_leader:
                        break
                    for payload in payloads:
                        async with asyncio.timeout(2):
                            await cast(Awaitable[int], self._redis.lrem(PROCESSING_KEY, 1, payload))
                    self._notify("flushed", len(payloads))
            except (RedisError, TimeoutError) as exc:
                self._notify("failed", max(len(payloads), self._fallback_size, 1))
                self._notify("retried", max(len(payloads), self._fallback_size, 1))
                logger.warning("Audit Redis delivery failed ({}); snapshots retained for retry", type(exc).__name__)
            finally:
                await self._report_size()

    async def _consume(self) -> None:
        while True:
            await self.flush()
            try:
                await asyncio.wait_for(self._wake.wait(), self._flush_interval)
            except TimeoutError:
                pass
            self._wake.clear()

    async def shutdown(self) -> None:
        if self._consumer is not None:
            self._consumer.cancel()
            try:
                await self._consumer
            except asyncio.CancelledError:
                pass
            self._consumer = None
        try:
            async with self._lock:
                try:
                    await self._restore_fallback()
                except RedisError, TimeoutError:
                    logger.warning(
                        "Audit shutdown retains {} snapshots in memory while Redis is unavailable", self._fallback_size
                    )
        finally:
            await self._leader.stop()
