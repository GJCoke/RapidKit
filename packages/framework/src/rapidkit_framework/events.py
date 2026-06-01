"""
事件总线 — 插件间解耦通信。

支持类型化事件、优先级、并发执行、通配符订阅、fire-and-forget 追踪和跨进程分布式广播。

Author : Coke
Date   : 2026-04-14
"""

import asyncio
import inspect
import json
from collections import deque
from dataclasses import dataclass
from dataclasses import fields as dc_fields
from datetime import datetime
from fnmatch import fnmatch
from itertools import groupby
from typing import Callable, ClassVar
from uuid import uuid4

from rapidkit_core.database import RedisManager
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone

logger = get_plugin_logger("EventBus")

DISTRIBUTED_CHANNEL = "eventbus:distributed"


@dataclass
class Event:
    """事件基类。所有事件必须继承此类并定义 event_name。"""

    event_name: ClassVar[str]


@dataclass
class DeadLetter:
    """未被任何 handler 处理的事件记录。"""

    event_name: str
    timestamp: datetime
    source: str | None = None


@dataclass
class _HandlerEntry:
    handler: Callable
    priority: int
    allowed_sources: list[str] | None


@dataclass
class _PatternEntry:
    pattern: str
    handler: Callable
    priority: int


class EventBus:
    """
    类型化事件总线，支持优先级、并发执行、通配符订阅和 fire-and-forget。

    全局单例，禁止二次实例化。使用 ``from rapidkit_framework.events import event_bus``。

    **Multi-instance note:** ``dead_letters`` and ``handler_errors`` are
    per-instance counters. For a global view across all instances, aggregate
    via external monitoring. Use ``distributed_emit()`` instead of
    ``async_emit()`` when handlers on other instances must also be triggered.
    """

    _instance: ClassVar[EventBus | None] = None

    def __new__(cls) -> EventBus:
        if cls._instance is not None:
            raise RuntimeError("EventBus is a singleton. Use `from rapidkit_framework.events import event_bus`.")
        instance = super().__new__(cls)
        cls._instance = instance
        return instance

    def __init__(self) -> None:
        self._instance_id: str = uuid4().hex
        self._handlers: dict[type[Event], list[_HandlerEntry]] = {}
        self._pattern_handlers: list[_PatternEntry] = []
        self._pending_tasks: set[asyncio.Task] = set()
        self._dead_letters: deque[DeadLetter] = deque(maxlen=100)
        self._handler_errors: dict[str, int] = {}
        self._event_registry: dict[str, type[Event]] = {}
        self._subscriber_task: asyncio.Task | None = None

    @property
    def dead_letters(self) -> list[DeadLetter]:
        """返回死信记录列表（最多 100 条）。"""
        return list(self._dead_letters)

    @property
    def handler_errors(self) -> dict[str, int]:
        """返回 handler 错误计数 {event_name: count}。"""
        return dict(self._handler_errors)

    # ==================== 注册 ====================

    def on(
        self,
        event_type: type[Event],
        handler: Callable,
        *,
        priority: int = 0,
        allowed_sources: list[str] | None = None,
    ) -> None:
        """
        按事件类型注册处理器。

        Args:
            event_type: 事件类（如 ActivityLogEvent）。
            handler: 处理函数，接收事件实例作为参数。
            priority: 优先级，数字越小越先执行，默认 0。
            allowed_sources: 仅接受来自指定源的事件，None 表示接受所有。
        """
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(
            _HandlerEntry(handler=handler, priority=priority, allowed_sources=allowed_sources)
        )
        # 自动注册到分布式事件类型表
        if hasattr(event_type, "event_name"):
            self._event_registry[event_type.event_name] = event_type

    def on_pattern(self, pattern: str, handler: Callable, *, priority: int = 0) -> None:
        """
        按事件名通配符模式注册处理器。

        Args:
            pattern: 通配符模式，如 ``"role.*"``。使用 fnmatch 匹配。
            handler: 处理函数，接收事件实例作为参数。
            priority: 优先级，数字越小越先执行，默认 0。
        """
        self._pattern_handlers.append(_PatternEntry(pattern=pattern, handler=handler, priority=priority))

    def emit(self, event: Event, *, source: str | None = None) -> None:
        """
        同步触发事件（仅调用同步 handler，异步 handler 将被跳过并警告）。

        同优先级按注册顺序执行（sync 无法并发）。
        """
        entries = self._collect_handlers(event, source)
        if not entries:
            self._dead_letters.append(DeadLetter(event_name=event.event_name, timestamp=timezone.now(), source=source))
            return
        for entry_handler, _ in entries:
            try:
                if inspect.iscoroutinefunction(entry_handler):
                    logger.warning(
                        "Async handler {} skipped in sync emit for event '{}'. Use async_emit() instead.",
                        getattr(entry_handler, "__name__", repr(entry_handler)),
                        event.event_name,
                    )
                    continue
                entry_handler(event)
            except Exception:
                self._handler_errors[event.event_name] = self._handler_errors.get(event.event_name, 0) + 1
                logger.exception(
                    "Error in handler {} for event '{}'",
                    getattr(entry_handler, "__name__", repr(entry_handler)),
                    event.event_name,
                )

    async def async_emit(self, event: Event, *, source: str | None = None) -> None:
        """
        异步触发事件。同优先级 handler 并发执行，不同优先级按顺序。
        """
        entries = self._collect_handlers(event, source)
        if not entries:
            self._dead_letters.append(DeadLetter(event_name=event.event_name, timestamp=timezone.now(), source=source))
            return

        sorted_entries = sorted(entries, key=lambda e: e[1])
        for _, group in groupby(sorted_entries, key=lambda e: e[1]):
            group_list = list(group)
            await asyncio.gather(*(self._call_handler(h, event) for h, _ in group_list))

    def fire_and_forget(self, event: Event, *, source: str | None = None) -> None:
        """
        发射事件但不等待 handler 完成。task 被追踪，shutdown 时会等待。
        """
        task = asyncio.create_task(self.async_emit(event, source=source))
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    async def shutdown(self, timeout: float = 5.0) -> None:
        """等待所有 pending fire-and-forget tasks 完成（带超时）。"""
        if self._subscriber_task:
            self._subscriber_task.cancel()
            self._subscriber_task = None
        if self._pending_tasks:
            logger.info("Waiting for {} pending tasks...", len(self._pending_tasks))
            done, pending = await asyncio.wait(
                self._pending_tasks,
                timeout=timeout,
            )
            if pending:
                logger.warning(
                    "{} tasks still pending after {:.1f}s timeout, cancelling...",
                    len(pending),
                    timeout,
                )
                for task in pending:
                    task.cancel()

    # ==================== 分布式事件 ====================

    async def distributed_emit(self, event: Event, *, source: str | None = None) -> None:
        """
        将事件广播到所有进程。

        先在本地立即执行 handler，再通过 Redis Pub/Sub 通知其他实例。
        其他实例的 subscriber 收到后触发本地 async_emit；发送方自身通过
        instance_id 去重，不会二次执行。
        """
        await self.async_emit(event, source=source)

        payload = json.dumps(
            {
                "instance_id": self._instance_id,
                "event_name": event.event_name,
                "source": source,
                "data": {f.name: getattr(event, f.name) for f in dc_fields(event) if f.name != "event_name"},
            }
        )
        redis = RedisManager.client()
        await redis.publish(DISTRIBUTED_CHANNEL, payload)

    async def start_subscriber(self) -> None:
        """启动 Redis Pub/Sub 订阅，收到分布式事件后触发本地 async_emit。"""
        if self._subscriber_task is not None:
            return
        self._subscriber_task = asyncio.create_task(self._subscribe_loop())
        self._pending_tasks.add(self._subscriber_task)
        self._subscriber_task.add_done_callback(self._pending_tasks.discard)
        logger.info("Distributed subscriber started.")

    async def _subscribe_loop(self) -> None:
        """Redis Pub/Sub 订阅循环（带指数退避重连）。"""
        retry_interval = 1.0
        max_interval = 30.0

        while True:
            try:
                from rapidkit_core.database import RedisManager

                redis = RedisManager.client()
                pubsub = redis.pubsub()
                await pubsub.subscribe(DISTRIBUTED_CHANNEL)
                retry_interval = 1.0  # 连接成功，重置退避
                logger.debug("Subscribed to '{}'", DISTRIBUTED_CHANNEL)

                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    try:
                        payload = json.loads(message["data"])

                        # 跳过自身发出的消息（去重）
                        if payload.get("instance_id") == self._instance_id:
                            continue

                        event_name = payload["event_name"]
                        source = payload.get("source")
                        data = payload.get("data", {})

                        event_cls = self._event_registry.get(event_name)
                        if event_cls is None:
                            logger.debug("No registered class for distributed event '{}'", event_name)
                            continue

                        event = event_cls(**data)
                        await self.async_emit(event, source=source)
                    except Exception:
                        logger.exception("Error processing distributed event")

            except asyncio.CancelledError:
                break
            except Exception:
                logger.warning(
                    "Pub/Sub connection lost, retrying in {interval:.0f}s...",
                    interval=retry_interval,
                )
                await asyncio.sleep(retry_interval)
                retry_interval = min(retry_interval * 2, max_interval)
            finally:
                try:
                    await pubsub.unsubscribe(DISTRIBUTED_CHANNEL)
                    await pubsub.close()
                except Exception:
                    pass

    def _collect_handlers(self, event: Event, source: str | None) -> list[tuple[Callable, int]]:
        """收集所有匹配的 handler（精确 + 通配符），返回 (handler, priority) 列表。"""
        result: list[tuple[Callable, int]] = []

        for entry in self._handlers.get(type(event), []):
            if entry.allowed_sources is not None and source not in entry.allowed_sources:
                continue
            result.append((entry.handler, entry.priority))

        for pe in self._pattern_handlers:
            if fnmatch(event.event_name, pe.pattern):
                result.append((pe.handler, pe.priority))

        return result

    async def _call_handler(self, handler: Callable, event: Event) -> None:
        """安全调用单个 handler，异常不传播。"""
        try:
            if inspect.iscoroutinefunction(handler):
                await handler(event)
            else:
                handler(event)
        except Exception:
            self._handler_errors[event.event_name] = self._handler_errors.get(event.event_name, 0) + 1
            logger.exception(
                "Error in handler {} for event '{}'",
                getattr(handler, "__name__", repr(handler)),
                event.event_name,
            )

    @classmethod
    def _reset(cls) -> None:
        """仅供测试使用：重置单例以允许重新创建。"""
        cls._instance = None


# 全局单例
event_bus = EventBus()
