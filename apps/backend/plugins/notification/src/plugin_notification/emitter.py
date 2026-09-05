"""
Write-only 外部 Socket.IO emitter：供 Celery worker 进程向在线用户推送。

复用与 web 进程相同的 Redis（AsyncRedisManager），通过 pub/sub 把 emit 广播给持有连接的进程。
"""

from typing import Any

import socketio
from rapidkit_core.config import settings

_external_sio: Any | None = None


def get_external_sio() -> Any:
    """返回一个 write-only 的 AsyncServer，用于跨进程 emit。"""
    global _external_sio  # noqa: PLW0603
    if _external_sio is None:
        manager = socketio.AsyncRedisManager(url=str(settings.REDIS_URL), write_only=True)
        _external_sio = socketio.AsyncServer(async_mode="asgi", client_manager=manager)
    return _external_sio
