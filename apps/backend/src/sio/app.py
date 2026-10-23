"""
Author  : Coke
Date    : 2025-05-19
"""

import importlib
import re
from collections.abc import Callable

from rapidkit_core.config import settings
from rapidkit_framework.plugin import PluginManifest
from socketio import ASGIApp, AsyncRedisManager

from src.sio.identity import IdentityAwareAsyncServer


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


def socket_cors_origins(
    origins: list[str], regex: str | None, debug: bool
) -> str | list[str] | Callable[[str], bool] | None:
    if "*" in origins:
        return "*"
    allowed = [*origins]
    if debug:
        allowed.append("https://admin.socket.io")
    if regex:
        return lambda origin: origin in allowed or re.fullmatch(regex, origin) is not None
    return allowed or None


redis_manager = AsyncRedisManager(url=str(settings.REDIS_URL))
socket = IdentityAwareAsyncServer(
    async_mode="asgi",
    transports=["websocket"],
    cors_allowed_origins=socket_cors_origins(
        settings.CORS_ORIGINS, settings.CORS_ORIGINS_REGEX, settings.EXPOSE_API_DOCS
    ),
    serializer="serializable_dict",
    client_manager=redis_manager,
)

if settings.EXPOSE_API_DOCS:
    socket.instrument(
        {
            "username": settings.SOCKETIO_ADMIN_USERNAME,
            "password": settings.SOCKETIO_ADMIN_PASSWORD.get_secret_value(),
        }
    )
socket_app = ASGIApp(socket)
