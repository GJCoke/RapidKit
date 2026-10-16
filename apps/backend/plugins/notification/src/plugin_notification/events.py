"""
Socket.IO /notifications 命名空间。

连接时校验 SID 认证态；连接成功后推送一次未读数校准事件。
新消息由投递 Worker 经外部 emitter 主动 emit（notification:new）。

Author : Coke
Date   : 2026-09-04
"""

from typing import Literal
from uuid import UUID

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from src.sio.app import socket
from src.sio.constants import authenticated_sid_structure, sid_user_structure
from src.sio.impersonation import inherit_root_identity, resolve_root_sid, unregister_socket

from plugin_notification.banner_service import BANNER_ROOM
from plugin_notification.channels import notification_user_room
from plugin_notification.crud import UserNotificationCRUD

logger = get_plugin_logger("Notification")

_NS = "/notifications"


async def _get_authenticated_user_id(sid: SID, redis: RedisDep) -> UUID | None:
    """Resolve a namespace SID to the authenticated identity on the root namespace."""
    root_sid = resolve_root_sid(socket, sid, _NS)
    if root_sid is None:
        return None
    authenticated = await redis.exists(authenticated_sid_structure.format(sid=root_sid))
    if not authenticated:
        return None
    user_id = await redis.hget(sid_user_structure.format(sid=root_sid), "id")
    if not user_id:
        return None
    return UUID(str(user_id))


@socket.on("connect", namespace=_NS)
async def notifications_connect(sid: SID, redis: RedisDep) -> Literal[False] | None:
    """验证 root namespace 认证态，并向新连接校准未读数。"""
    user_id = await _get_authenticated_user_id(sid, redis)
    if user_id is None:
        return False

    data = await inherit_root_identity(socket, redis, sid, _NS)
    if data is None or data["id"] != str(user_id):
        return False
    await socket.enter_room(sid, notification_user_room(user_id), namespace=_NS)
    await socket.enter_room(sid, BANNER_ROOM, namespace=_NS)
    async with AsyncSessionLocal() as session:
        count = await UserNotificationCRUD(session).get_unread_count(user_id)
    await socket.emit("notification:unread-count", {"count": count}, to=sid, namespace=_NS)
    return None


@socket.on("notifications:sync", namespace=_NS)
async def notifications_sync(sid: SID, redis: RedisDep) -> None:
    """客户端主动请求未读数校准。"""
    user_id = await _get_authenticated_user_id(sid, redis)
    if user_id is None:
        return
    async with AsyncSessionLocal() as session:
        count = await UserNotificationCRUD(session).get_unread_count(user_id)
    await socket.emit("notification:unread-count", {"count": count}, to=sid, namespace=_NS)


@socket.on("disconnect", namespace=_NS)
async def notifications_disconnect(sid: SID, redis: RedisDep) -> None:
    await unregister_socket(socket, redis, sid, _NS)
