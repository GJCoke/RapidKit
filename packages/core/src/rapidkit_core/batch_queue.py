"""
Generic async batch queue — collects items and flushes in batches.

Used by AuditMiddleware to batch-write audit logs, reducing DB pressure.

Author : Coke
Date   : 2026-04-20
"""

import asyncio
from typing import Awaitable, Callable, Generic, TypeVar

from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("BatchQueue")

T = TypeVar("T")


class AsyncBatchQueue(Generic[T]):
    """
    异步批量队列。

    收集 items，当达到 ``batch_size`` 或 ``flush_interval`` 超时后，
    调用 ``handler`` 批量处理。

    **Crash durability:** Items buffered in memory are lost if the process
    crashes before flush. For audit logs this is an accepted trade-off
    (performance vs durability). If zero-loss is required, consider writing
    to a Redis Stream first and consuming from there.

    Args:
        handler: 批量处理回调，接收 ``list[T]``。
        batch_size: 触发批量处理的条目数。
        flush_interval: 定时刷新间隔（秒）。
    """

    def __init__(
        self,
        handler: Callable[[list[T]], Awaitable[None]],
        batch_size: int,
        flush_interval: float,
        max_buffer_size: int | None = None,
        retry_delays: tuple[float, ...] = (),
        on_state: Callable[[str, int], None] | None = None,
    ) -> None:
        self._handler = handler
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._buffer: list[T] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task[None] | None = None
        self._running = False
        self._max_buffer_size = max_buffer_size
        self._retry_delays = retry_delays
        self._on_state = on_state

    def _notify(self, event: str, count: int) -> None:
        if self._on_state is not None:
            try:
                self._on_state(event, count)
            except Exception:
                logger.exception("Batch queue state callback failed")

    async def start(self) -> None:
        """启动定时刷新任务。"""
        self._running = True
        self._flush_task = asyncio.create_task(self._periodic_flush())

    async def put(self, item: T) -> None:
        """添加一条记录。达到 batch_size 时自动触发 flush。"""
        async with self._lock:
            if self._max_buffer_size is not None and len(self._buffer) >= self._max_buffer_size:
                self._notify("failed", 1)
                raise BufferError("Batch queue capacity exceeded")
            self._buffer.append(item)
            self._notify("queued", 1)
            self._notify("buffer_size", len(self._buffer))
            if len(self._buffer) >= self._batch_size:
                await self._do_flush()

    async def flush(self) -> None:
        """手动触发一次 flush。"""
        async with self._lock:
            await self._do_flush()

    async def shutdown(self) -> None:
        """停止定时任务并 flush 剩余记录。"""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
            self._flush_task = None
        await self.flush()

    async def _do_flush(self) -> None:
        """内部 flush：取出 buffer 并调用 handler。调用方须持有 _lock。"""
        if not self._buffer:
            return
        batch, self._buffer = self._buffer[:], []
        self._notify("buffer_size", 0)
        for attempt in range(len(self._retry_delays) + 1):
            try:
                await self._handler(batch)
                self._notify("flushed", len(batch))
                return
            except asyncio.CancelledError:
                self._buffer[:0] = batch
                self._notify("buffer_size", len(self._buffer))
                raise
            except Exception:
                if attempt == len(self._retry_delays):
                    self._notify("failed", len(batch))
                    logger.exception("Handler error after {} attempts, {} items not persisted", attempt + 1, len(batch))
                else:
                    self._notify("retried", len(batch))
                    try:
                        await asyncio.sleep(self._retry_delays[attempt])
                    except asyncio.CancelledError:
                        self._buffer[:0] = batch
                        self._notify("buffer_size", len(self._buffer))
                        raise

    async def _periodic_flush(self) -> None:
        """定时 flush 循环。"""
        while self._running:
            await asyncio.sleep(self._flush_interval)
            try:
                await self.flush()
            except Exception:
                logger.exception("Periodic flush error")
