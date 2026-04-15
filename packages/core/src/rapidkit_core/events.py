"""
事件总线 — 插件间解耦通信。

Author : Coke
Date   : 2026-04-14
"""

import asyncio
import inspect
from typing import Any, Callable

from rapidkit_core.log import logger


class EventBus:
    """
    简单的事件总线，支持同步和异步 handler。

    插件通过 ``on()`` 注册事件处理器，通过 ``emit()`` / ``async_emit()`` 触发事件。
    handler 异常不影响其他 handler 的执行。
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[tuple[Callable, list[str] | None]]] = {}

    def on(
        self,
        event: str,
        handler: Callable,
        allowed_sources: list[str] | None = None,
    ) -> None:
        """
        注册事件处理器。

        Args:
            event: 事件名称，如 "role.updated"。
            handler: 处理函数，接收 data 参数。
            allowed_sources: 仅接受来自指定源的事件，None 表示接受所有。
        """
        if event not in self._handlers:
            self._handlers[event] = []
        self._handlers[event].append((handler, allowed_sources))

    def emit(self, event: str, data: Any = None, *, source: str | None = None) -> None:
        """
        同步触发事件（仅调用同步 handler，异步 handler 将被跳过并警告）。

        Args:
            event: 事件名称。
            data: 事件数据。
            source: 事件来源插件名称。
        """
        for handler, allowed_sources in self._handlers.get(event, []):
            if allowed_sources is not None and source not in allowed_sources:
                continue
            try:
                if inspect.iscoroutinefunction(handler):
                    logger.warning(
                        f"Async handler {handler.__name__} skipped in sync emit for event '{event}'. "
                        f"Use async_emit() instead."
                    )
                    continue
                handler(data)
            except Exception:
                logger.exception(f"Error in handler {handler.__name__} for event '{event}'")

    async def async_emit(self, event: str, data: Any = None, *, source: str | None = None) -> None:
        """
        异步触发事件（支持同步和异步 handler）。

        Args:
            event: 事件名称。
            data: 事件数据。
            source: 事件来源插件名称。
        """
        for handler, allowed_sources in self._handlers.get(event, []):
            if allowed_sources is not None and source not in allowed_sources:
                continue
            try:
                if inspect.iscoroutinefunction(handler):
                    await handler(data)
                else:
                    handler(data)
            except Exception:
                logger.exception(f"Error in handler {handler.__name__} for event '{event}'")


# 全局单例
event_bus = EventBus()
