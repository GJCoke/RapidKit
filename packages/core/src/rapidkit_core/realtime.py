"""
跨进程 Socket.IO 推送：write-only emitter 与权限变更信号。

复用与 web 进程相同的 Redis（AsyncRedisManager），web 与 Celery 进程都可通过 pub/sub
把 emit 广播给持有连接的进程。

Author : Coke
Date   : 2026-10-15
"""

import time
from typing import Any, Literal
from uuid import UUID

import socketio

from rapidkit_core.config import settings
from rapidkit_core.log import logger

PERMISSION_EVENT = "permission:changed"
PERMISSION_BROADCAST_ROOM = "perm:authenticated"

PermissionScope = Literal["roles", "user", "menu"]

_external_sio: Any | None = None


def get_external_sio() -> Any:
    """返回一个 write-only 的 AsyncServer，用于跨进程 emit。"""
    global _external_sio  # noqa: PLW0603
    if _external_sio is None:
        manager = socketio.AsyncRedisManager(url=str(settings.REDIS_URL), write_only=True)
        _external_sio = socketio.AsyncServer(async_mode="asgi", client_manager=manager)
    return _external_sio


def permission_user_room(user_id: UUID | str) -> str:
    """单用户权限房间名。"""
    return f"perm:user:{user_id}"


async def emit_permission_changed(
    scope: PermissionScope,
    *,
    roles: list[str] | None = None,
    user_id: UUID | str | None = None,
) -> None:
    """
    推送权限变更瘦信号；失败只记录 WARNING，不影响主流程。

    Args:
        scope: 变更范围（roles / user / menu）。
        roles: ``scope="roles"`` 时受影响的角色编码。
        user_id: 指定时只推送给该用户，否则广播给全部登录连接。
    """
    payload: dict[str, Any] = {"scope": scope, "revision": time.time_ns() // 1_000_000}
    if scope == "roles":
        payload["roles"] = list(roles or [])
    room = permission_user_room(user_id) if user_id is not None else PERMISSION_BROADCAST_ROOM
    try:
        await get_external_sio().emit(PERMISSION_EVENT, payload, room=room)
    except Exception as exc:
        logger.warning(
            "Permission change push failed: scope={scope} room={room} error={error}",
            scope=scope,
            room=room,
            error=exc,
        )
