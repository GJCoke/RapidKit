"""
SocketIO 事件 — /dashboard 命名空间。

Author : Coke
Date   : 2026-05-11
"""

from typing import Literal
from uuid import UUID

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_common.protocols.user import UserResolver
from rapidkit_framework.services import get_service
from src.sio.app import socket
from src.sio.constants import authenticated_sid_structure, sid_user_structure
from src.sio.impersonation import inherit_root_identity, resolve_root_sid, unregister_socket

from plugin_system.realtime_access import is_dashboard_realtime_allowed


@socket.on("connect", namespace="/dashboard")
async def dashboard_connect(sid: SID, redis: RedisDep) -> Literal[False] | None:
    """Dashboard 连接时验证 SID 认证状态并推送当前在线用户数。"""
    root_sid = resolve_root_sid(socket, sid, "/dashboard")
    if root_sid is None:
        return False
    authenticated = await redis.exists(authenticated_sid_structure.format(sid=root_sid))
    if not authenticated:
        return False
    user_id = await redis.hget(sid_user_structure.format(sid=root_sid), "id")
    if not user_id:
        return False
    user = await get_service(UserResolver).get_by_id(UUID(str(user_id)))
    if not user or not is_dashboard_realtime_allowed(user):
        return False
    data = await inherit_root_identity(socket, redis, sid, "/dashboard")
    if data is None or data["id"] != str(user_id):
        return False
    count = await redis.scard("online_users") or 0
    await socket.emit("dashboard:online_users", {"count": count}, to=sid, namespace="/dashboard")
    return None


@socket.on("disconnect", namespace="/dashboard")
async def dashboard_disconnect(sid: SID, redis: RedisDep) -> None:
    await unregister_socket(socket, redis, sid, "/dashboard")
