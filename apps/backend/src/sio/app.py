"""
Author  : Coke
Date    : 2025-05-19
"""

from importlib import util
from pathlib import Path

from fastapi_sio_di import AsyncServer
from rapidkit_core.config import settings
from socketio import ASGIApp, AsyncRedisManager


def auto_register_events() -> None:
    """
    动态导入 events 目录下所有 Python 文件以注册 Socket.IO 事件。

    此函数会扫描 sio/events 目录，导入所有不以下划线开头的 .py 文件，并加载为模块。
    这样可确保所有用 @socket.event 装饰的事件处理器自动注册到服务器。
    """
    base_path = Path(__file__).parent / "events"
    for file in base_path.glob("*.py"):
        if file.name.startswith("_"):
            continue

        module_name = f"sio.events.{file.stem}"
        spec = util.spec_from_file_location(module_name, file)
        if spec is None:
            raise ImportError(f"Could not create a spec for module '{module_name}' at '{base_path}'")

        if spec.loader is None:
            raise ImportError(f"Spec loader is None for module '{module_name}' at '{base_path}'")

        module = util.module_from_spec(spec)
        spec.loader.exec_module(module)


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
auto_register_events()
