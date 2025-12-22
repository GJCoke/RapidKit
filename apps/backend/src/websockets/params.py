"""
Author  : Coke
Date    : 2025-05-20
"""

from typing import Callable


class SID(str):
    """
    标记 'sid' 依赖的类。

    用作类型注解，表示该参数应从 socket 会话 ID 解析。

    Examples:
        @sio.on("message")
        async def message(sid: SID):
            print(sid)
    """


class Environ(dict):
    """
    标记 'environ' 依赖的类。

    用作类型注解，表示该参数应从 socket 环境/上下文解析。

    仅在 'connect' 事件中生效。

    Examples:
        @sio.on("connect")
        async def connect(environ: Environ):
            print(environ)
    """


class Depends:
    """
    依赖描述符类。

    包装可调用依赖，并可选指示解析时是否缓存结果。

    Args:
        dependency: 需要作为依赖解析的可调用对象。
        use_cache: 是否缓存依赖结果，默认为 True。
    """

    def __init__(self, dependency: Callable, use_cache: bool = True):
        self.dependency = dependency
        self.use_cache = use_cache
