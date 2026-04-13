import uuid
from typing import Any, Literal, TypeAlias

from fastapi_sio_di import SID

from src.common.schemas import BaseModel
from src.core.log import logger
from src.sio.app import socket
from src.utils.timezone import timezone

MessageType: TypeAlias = Literal["text", "image", "video", "audio", "file", "system"]


class I18nContent(BaseModel):
    key: str  # 翻译 key, 如 "chat.user_joined"
    params: dict[str, Any]  # 翻译参数, 如 { username: 'Doraemon' }


class MediaPayload(BaseModel):
    url: str  # 资源链接 (Base64 或远程 URL)
    name: str | None = None  # 文件名
    size: int | None = None  # 文件大小
    duration: int | None = None  # 音视频时长 (秒)
    thumbnail: str | None = None  # 视频封面图


class BaseMessage(BaseModel):
    id: str
    sender: str
    time: str
    avatar: str | None = None
    extra: dict[str, Any] | None = None


class TextMessage(BaseMessage):
    type: Literal["text"] = "text"
    content: str


class SystemMessage(BaseMessage):
    type: Literal["system"] = "system"
    content: I18nContent


class MediaMessage(BaseMessage):
    type: Literal["image", "video", "audio", "file"]
    content: MediaPayload


Message: TypeAlias = TextMessage | SystemMessage | MediaMessage


class MessageEvent(BaseModel):
    group: str
    content: str
    avatar: str | None = None


class ConnectEvent(BaseModel):
    username: str


@socket.on("connect", namespace="/chat")
async def on_connect(sid: SID, auth: ConnectEvent) -> None:
    """客户端连接聊天室"""
    # 将用户信息存入 session 方便后续使用
    await socket.save_session(sid, {"username": auth.username}, namespace="/chat")
    logger.info("[Chat] User {username} ({sid}) connected", username=auth.username, sid=sid)


@socket.on("join", namespace="/chat")
async def on_join(sid: SID, group: str) -> None:
    """处理加入房间逻辑"""
    session = await socket.get_session(sid, namespace="/chat")
    username = session.get("username", "Unknown")

    # 将该连接加入指定的房间
    await socket.enter_room(sid, group, namespace="/chat")

    # 构造系统通知消息
    notification = SystemMessage(
        id=str(uuid.uuid4()),
        sender="System",
        content=I18nContent(key="page.socketio.chat.userJoined", params={"username": username, "group": group}),
        avatar="/src/assets/imgs/avatar_system.jpg",
        time=timezone.f_time(timezone.now_local()),
    )

    # 广播给房间内的所有人
    await socket.emit("message", notification, room=group, namespace="/chat")
    logger.info("[Chat] {username} joined room: {group}", username=username, group=group)


@socket.on("message", namespace="/chat")
async def on_message(sid: SID, data: MessageEvent) -> None:
    """处理聊天消息转发"""
    group = data.group
    content = data.content

    if not group or not content:
        return

    session = await socket.get_session(sid, namespace="/chat")
    sender = session.get("username", "Unknown")

    # 构造发往前端的消息负载
    message_payload = TextMessage(
        id=str(uuid.uuid4()),
        sender=sender,
        content=content,
        avatar=data.avatar,
        time=timezone.f_time(timezone.now_local()),
    )

    # 广播给该组内的所有人（包括发送者自己）
    await socket.emit("message", message_payload, room=group, namespace="/chat")
    logger.info("[Chat] Message in {group} from {sender}: {content}", group=group, sender=sender, content=content)


@socket.on("disconnect", namespace="/chat")
async def on_disconnect(sid: SID) -> None:
    """客户端断开连接"""
    session = await socket.get_session(sid, namespace="/chat")
    username = session.get("username", "Unknown")
    rooms = socket.rooms(sid, namespace="/chat")

    for group in rooms:
        if group == sid:
            continue

        notification = SystemMessage(
            id=str(uuid.uuid4()),
            type="system",
            sender="System",
            content=I18nContent(key="page.socketio.chat.userLeft", params={"username": username, "group": group}),
            avatar="/src/assets/imgs/avatar_system.jpg",
            time=timezone.f_time(timezone.now_local()),
        )

        await socket.emit("message", notification, room=group, namespace="/chat")
        logger.info("[Chat] {username} left room: {group}", username=username, group=group)

    logger.info("[Chat] User {username} ({sid}) disconnected", username=username, sid=sid)
