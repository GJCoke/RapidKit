"""
Socket.IO /notifications 命名空间。

连接使用握手校验过的身份；连接成功后推送一次未读数校准事件。
新消息由投递 Worker 经外部 emitter 主动 emit（notification:new）。

Author : Coke
Date   : 2026-09-04
"""

from uuid import UUID

from fastapi_sio_di import SID
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.identity import current_identity
from src.sio.app import socket

from plugin_notification.banner_service import BANNER_ROOM
from plugin_notification.channels import notification_user_room
from plugin_notification.crud import UserNotificationCRUD

logger = get_plugin_logger("Notification")

_NS = "/notifications"


@socket.on("connect", namespace=_NS)
async def notifications_connect(sid: SID) -> None:
    """向已认证的新连接校准未读数。"""
    user_id = UUID(current_identity().user_id)
    await socket.enter_room(sid, notification_user_room(user_id), namespace=_NS)
    await socket.enter_room(sid, BANNER_ROOM, namespace=_NS)
    async with AsyncSessionLocal() as session:
        count = await UserNotificationCRUD(session).get_unread_count(user_id)
    await socket.emit("notification:unread-count", {"count": count}, to=sid, namespace=_NS)
    return None


@socket.on("notifications:sync", namespace=_NS)
async def notifications_sync(sid: SID) -> None:
    """客户端主动请求未读数校准。"""
    user_id = UUID(current_identity().user_id)
    async with AsyncSessionLocal() as session:
        count = await UserNotificationCRUD(session).get_unread_count(user_id)
    await socket.emit("notification:unread-count", {"count": count}, to=sid, namespace=_NS)
