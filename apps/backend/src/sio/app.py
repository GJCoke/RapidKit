"""
Author  : Coke
Date    : 2025-05-19
"""

import importlib

from fastapi_sio_di import AsyncServer
from rapidkit_core.config import settings
from rapidkit_framework.plugin import PluginManifest
from socketio import ASGIApp, AsyncRedisManager


def auto_register_events(plugins: list[PluginManifest] | None = None) -> None:
    """注册 SocketIO 事件处理器。

    1. Core events (always loaded)
    2. Retained non-plugin events (chat — future plugin candidate)
    3. Plugin-declared event modules
    """
    # 1. Core events
    import src.sio.events.chat  # noqa: F401
    import src.sio.events.connection  # noqa: F401

    # 3. Plugin-declared event modules
    if plugins:
        for plugin in plugins:
            for module_path in plugin.sio_modules:
                importlib.import_module(module_path)


redis_manager = AsyncRedisManager(url=str(settings.REDIS_URL))
socket = AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[],
    serializer="serializable_dict",
    client_manager=redis_manager,
)

if settings.ENVIRONMENT.is_debug:
    socket.instrument(
        {
            "username": settings.SOCKETIO_ADMIN_USERNAME,
            "password": settings.SOCKETIO_ADMIN_PASSWORD.get_secret_value(),
        }
    )
socket_app = ASGIApp(socket)
