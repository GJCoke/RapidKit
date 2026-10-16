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
from src.sio.impersonation import inherit_root_identity, session_expiry, store_socket_identity, unregister_socket

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
        context = await get_service(CurrentUserProvider).get_auth_context(token)
        if context is None:
            return False
        data = {"id": str(context.subject.id), "name": context.subject.name}
        if context.impersonation_session_id is not None:
            data.update(
                actor_id=str(context.actor.id),
                impersonation_session_id=str(context.impersonation_session_id),
                expires_at=str(await session_expiry(context.impersonation_session_id)),
            )
        await store_socket_identity(socket, redis, sid, "/worker", data)
    else:
        if await inherit_root_identity(socket, redis, sid, "/worker") is None:
            return False
    logger.info("Client {sid} connected to /worker namespace", sid=sid)
    return None


@socket.on("disconnect", namespace="/worker")
async def on_worker_disconnect(sid: SID, redis: RedisDep) -> None:
    """
    处理 /worker namespace 的断开连接事件。

    前端离开 Worker 管理页面时断开连接。
    """
    await unregister_socket(socket, redis, sid, "/worker")
    logger.info("Client {sid} disconnected from /worker namespace", sid=sid)
