"""
SocketIO 事件 — /worker 命名空间。

Author : Coke
Date   : 2026-05-11
"""

from typing import Literal

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_common.protocols.auth import CurrentUserProvider
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.services import get_service
from src.sio.app import socket
from src.sio.constants import authenticated_sid_structure

logger = get_plugin_logger("Worker")


@socket.on("connect", namespace="/worker")
async def on_worker_connect(sid: SID, redis: RedisDep, auth: dict[str, object] | None) -> Literal[False] | None:
    """
    处理 /worker namespace 的连接事件。

    前端进入 Worker 管理页面时连接此 namespace。
    """
    if auth is not None:
        # Authenticate this namespace directly, independent of root connection timing.
        if not isinstance(auth, dict):
            return False
        token = auth.get("access_token")
        if not isinstance(token, str) or not token:
            return False
        user = await get_service(CurrentUserProvider).get_current_user(token)
        if user is None:
            return False
    else:
        # Compatibility for clients that reuse an already authenticated root connection.
        eio_sid = socket.manager.eio_sid_from_sid(sid, "/worker")
        if eio_sid is None:
            return False
        root_sid = socket.manager.sid_from_eio_sid(eio_sid, "/")
        if root_sid is None:
            return False
        authenticated = await redis.exists(authenticated_sid_structure.format(sid=root_sid))
        if not authenticated:
            return False
    logger.info("Client {sid} connected to /worker namespace", sid=sid)
    return None


@socket.on("disconnect", namespace="/worker")
async def on_worker_disconnect(sid: SID) -> None:
    """
    处理 /worker namespace 的断开连接事件。

    前端离开 Worker 管理页面时断开连接。
    """
    logger.info("Client {sid} disconnected from /worker namespace", sid=sid)
