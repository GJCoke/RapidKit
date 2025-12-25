"""
Author  : Coke
Date    : 2025-05-16
"""

import asyncio
from typing import Any, Awaitable, Callable, TypeVar, overload

from pydantic import BaseModel, ValidationError
from socketio import AsyncServer as SocketIOAsyncServer

from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.utils.utils import format_validation_errors
from src.websockets.dependencies.core import LifespanContext, solve_dependency

T = TypeVar("T")


class AsyncServer(SocketIOAsyncServer):
    """
    异步 Socket.IO 服务器，支持依赖注入和事件处理。
    """

    def __init__(self, cors_allowed_origins: str | list[str] | None = None, **kwargs: Any) -> None:
        if cors_allowed_origins is not None and "*" in cors_allowed_origins:
            cors_allowed_origins = "*"
        super().__init__(cors_allowed_origins=cors_allowed_origins, **kwargs)

    def on(self, event: str, handler: Callable | None = None, namespace: str | None = None) -> Callable:
        """
        事件处理器注册装饰器，支持依赖注入。

        此方法包装提供的处理函数，并自动解析其依赖，支持上下文清理、校验错误处理，并在需要时向客户端发送错误消息。

        Args:
            event: 要绑定的事件名。
            handler: 事件处理函数。如果为 None，则返回装饰器。
            namespace: 事件的命名空间。

        Returns:
            装饰器函数或原始处理函数。
        """

        def decorator(func: Callable) -> Callable:
            async def wrapper(sid: str, *args: Any, **kwargs: Any) -> None:
                context = LifespanContext()
                cache: dict[Any, Any] = {}

                data = args[0] if args else None
                environ = kwargs.get("environ", {})

                cache["__sid__"] = sid
                cache["__data__"] = data
                cache["__environ__"] = environ

                try:
                    await solve_dependency(func, context, cache)

                except ValidationError as e:
                    details = format_validation_errors(e)
                    await self.emit(
                        "error",
                        AppException(StatusCode.SOCKET_AUTHENTICATION_FAILED, data=details).dump(),
                        to=sid,
                    )
                    raise

                except TypeError:
                    await self.emit(
                        "error",
                        AppException(
                            code=StatusCode.SOCKET_INVALID_MESSAGE,
                            data=f"TypeError: expected a 'map', but received an '{type(data).__name__}'.",
                        ).dump(),
                        to=sid,
                    )
                    raise

                finally:
                    await context.run_teardowns()

            return super(AsyncServer, self).on(event=event, handler=handler, namespace=namespace)(wrapper)

        return decorator if handler is None else decorator(handler)

    async def emit(
        self,
        event: str,
        data: Any | None = None,
        to: str | None = None,
        room: str | None = None,
        skip_sid: str | list[str] | None = None,
        namespace: str | None = None,
        callback: Callable | None = None,
        ignore_queue: bool = False,
        serializer: str = "serializable_dict",
    ) -> Awaitable[None]:
        """
        向客户端发送事件，可选携带数据、房间或命名空间。

        Args:
            event: 要发送的事件名。
            data: 发送的事件数据。
            to: 指定发送的客户端ID。
            room: 指定发送的房间。
            skip_sid: 发送时跳过的会话ID。
            namespace: 发送事件的命名空间。
            callback: 发送完成后的回调函数。
            ignore_queue: 是否忽略事件队列。
            serializer: 用于序列化模型的方法名。

        Returns:
            发送完成的 awaitable 对象。
        """
        data = self._pydantic_model_to_dict(data, serializer=serializer)
        return await super().emit(
            event=event,
            data=data,
            to=to,
            room=room,
            skip_sid=skip_sid,
            namespace=namespace,
            callback=callback,
            ignore_queue=ignore_queue,
        )

    async def send(
        self,
        data: Any,
        to: str | None = None,
        room: str | None = None,
        skip_sid: str | list[str] | None = None,
        namespace: str | None = None,
        callback: Callable | None = None,
        ignore_queue: bool = False,
        serializer: str = "serializable_dict",
    ) -> Awaitable[None]:
        """
        发送消息，可选指定客户端、房间或命名空间。

        Args:
            data: 要发送的数据。
            to: 指定发送的客户端ID。
            room: 指定发送的房间。
            skip_sid: 发送时跳过的会话ID。
            namespace: 发送消息的命名空间。
            callback: 发送完成后的回调函数。
            ignore_queue: 是否忽略消息队列。
            serializer: 用于序列化模型的方法名。

        Returns:
            发送完成的 awaitable 对象。
        """
        return await self.emit(
            "message",
            data=data,
            to=to,
            room=room,
            skip_sid=skip_sid,
            namespace=namespace,
            callback=callback,
            ignore_queue=ignore_queue,
            serializer=serializer,
        )

    async def _trigger_event(self, event: str, namespace: str, *args: Any) -> Awaitable[object] | object:
        """
        触发应用级事件处理器。

        此方法尝试定位并调用已注册的事件处理器（包括具体事件或命名空间级处理器），支持协程和普通函数。

        Args:
            event: 要触发的事件名（如 "connect"）。
            namespace: 事件关联的命名空间。
            *args: 传递给事件处理器的位置参数。
                对于 "connect" 事件，顺序为 (sid, environ, data)。

        Returns:
            事件处理器的返回值，或未找到时为 self.not_handled。
        """
        handler, args = self._get_event_handler(event, namespace, args)
        if handler:
            try:
                ret = self._call_handler(handler, event, args)
                if asyncio.iscoroutine(ret) or isinstance(ret, Awaitable):
                    ret = await ret
            except asyncio.CancelledError:
                ret = None
            return ret

        handler, args = self._get_namespace_handler(namespace, args)
        if handler:
            return await handler.trigger_event(event, *args)

        else:
            return self.not_handled

    @staticmethod
    def _call_handler(handler: Callable, event: str, args: tuple) -> Any:
        """
        用合适参数调用事件处理器。

        对于 "connect" 事件，注入 environ 关键字参数，其余参数按位置传递。
        对于 "disconnect"，为兼容性去除最后一个参数。

        Args:
            handler: 要调用的函数或协程。
            event: 事件名（如 "connect"、"disconnect" 等）。
            args: 传递给处理器的参数。

        Returns:
            处理器的返回值。
        """
        if event == "connect":
            if len(args) == 3:
                return handler(args[0], args[2], environ=args[1])
            elif len(args) == 2:
                return handler(args[0], environ=args[1])
            else:
                return handler(*args)
        elif event == "disconnect":
            return handler(*args[:-1])
        else:
            return handler(*args)

    @staticmethod
    @overload
    def _pydantic_model_to_dict(data: BaseModel, serializer: str = "serializable_dict") -> dict: ...

    @staticmethod
    @overload
    def _pydantic_model_to_dict(data: T, serializer: str = "serializable_dict") -> T: ...

    @staticmethod
    def _pydantic_model_to_dict(data: BaseModel | T, serializer: str = "serializable_dict") -> dict | T:
        """
        使用指定序列化方法将 Pydantic 模型转换为字典。

        如果输入 data 是 BaseModel 实例，则优先使用指定的序列化方法（如 serializable_dict），否则回退为 model_dump()。

        Args:
            data: 要转换的数据。如果是 Pydantic 模型则会被转换。
            serializer: 用于序列化模型的方法名。

        Returns:
            如果 data 是 Pydantic 模型则返回字典，否则原样返回。
        """
        if isinstance(data, BaseModel):
            if serializer != "model_dump" and hasattr(data, serializer):
                return getattr(data, serializer)()

            return data.model_dump()

        return data
