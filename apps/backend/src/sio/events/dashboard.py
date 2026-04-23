"""
Dashboard 命名空间事件处理。

Author : Coke
Date   : 2026-04-10
"""

from typing import Literal

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep

from src.sio.app import socket
from src.sio.constants import authenticated_sid_structure


@socket.on("connect", namespace="/dashboard")
async def dashboard_connect(sid: SID, redis: RedisDep) -> Literal[False] | None:
    """Dashboard 连接时验证 SID 认证状态并推送当前在线用户数。"""
    authenticated = await redis.exists(authenticated_sid_structure.format(sid=sid))
    if not authenticated:
        return False
    count = await redis.scard("online_users") or 0
    await socket.emit("dashboard:online_users", {"count": count}, to=sid, namespace="/dashboard")
    return None
