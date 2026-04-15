"""
Dashboard 命名空间事件处理。

Author : Coke
Date   : 2026-04-10
"""

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep

from src.sio.app import socket


@socket.on("connect", namespace="/dashboard")
async def dashboard_connect(sid: SID, redis: RedisDep) -> None:
    """Dashboard 连接时推送当前在线用户数。"""
    count = await redis.scard("online_users") or 0  # ty: ignore[invalid-await]
    await socket.emit("dashboard:online_users", {"count": count}, to=sid, namespace="/dashboard")
