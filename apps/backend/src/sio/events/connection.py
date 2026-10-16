"""
Author  : Coke
Date    : 2025-05-16
"""

import asyncio
import time
from typing import Literal

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_common.protocols.auth import CurrentUserProvider
from rapidkit_common.schemas import BaseModel
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger
from rapidkit_core.realtime import PERMISSION_BROADCAST_ROOM, permission_user_room
from rapidkit_framework.services import get_service

from src.sio.app import socket
from src.sio.constants import (
    SESSION_TTL,
    authenticated_sid_structure,
    online_users_structure,
    sid_user_structure,
    user_sid_structure,
)
from src.sio.impersonation import session_expiry, store_socket_identity, unregister_socket


class RedisUser(BaseModel):
    """
    Redis 用户模型。
    """

    id: str
    name: str
    actor_id: str | None = None
    impersonation_session_id: str | None = None
    expires_at: int | None = None


class User(BaseModel):
    """
    用户模型。
    """

    name: str


class AccessToken(BaseModel):
    """
    访问令牌模型。
    """

    access_token: str


@socket.event
async def connect(sid: SID, auth: AccessToken, redis: RedisDep) -> Literal[False] | None:
    """
    处理 websocket 连接事件。

    Args:
        sid: 会话ID。
        auth: 访问令牌对象。
        redis: Redis 依赖。

    Returns:
        None 或 False，表示连接是否成功。
    """
    token = auth.access_token
    if not token:
        return False

    current_user_provider = get_service(CurrentUserProvider)
    context = await current_user_provider.get_auth_context(token)
    if context is None:
        return False

    user_info = context.subject
    user_id = str(user_info.id)
    await socket.enter_room(sid, permission_user_room(user_id))
    await socket.enter_room(sid, PERMISSION_BROADCAST_ROOM)
    sid_key = sid_user_structure.format(sid=sid)
    user = RedisUser(id=user_id, name=user_info.name)
    if context.impersonation_session_id is not None:
        user.actor_id = str(context.actor.id)
        user.impersonation_session_id = str(context.impersonation_session_id)
        user.expires_at = await session_expiry(context.impersonation_session_id)
    data = {key: str(value) for key, value in user.model_dump(exclude_none=True).items()}
    await store_socket_identity(socket, redis, sid, "/", data)
    await redis.hset(sid_key, mapping=data)
    if user.expires_at is not None:
        remaining = max(1, int(user.expires_at - time.time()))
        await redis.expire(sid_key, remaining)
        await redis.set(authenticated_sid_structure.format(sid=sid), "1", ex=remaining)
        return None
    await redis.expire(sid_key, SESSION_TTL)
    await redis.set(user_sid_structure.format(user_id=user_id), sid, ex=SESSION_TTL)
    await redis.sadd(online_users_structure, user_id)
    await redis.set(authenticated_sid_structure.format(sid=sid), "1", ex=SESSION_TTL)

    # 推送在线用户数到 Dashboard
    count = await redis.scard(online_users_structure) or 0
    await socket.emit("dashboard:online_users", {"count": count}, namespace="/dashboard")

    return None


@socket.event
async def disconnect(sid: SID, redis: RedisDep) -> None:
    """
    处理 websocket 断开连接事件。

    Args:
        sid: 会话ID。
        redis: Redis 依赖。
    """
    await unregister_socket(socket, redis, sid, "/")
    user = None
    try:
        user = await redis.hgetall(sid_user_structure.format(sid=sid), response_model=RedisUser)
        await redis.delete(sid_user_structure.format(sid=sid))
        await redis.delete(authenticated_sid_structure.format(sid=sid))
        if user and user.impersonation_session_id:
            return
        if not user or not user.id:
            return
        await redis.delete(user_sid_structure.format(user_id=user.id))
        await redis.srem(online_users_structure, user.id)
        await redis.delete(authenticated_sid_structure.format(sid=sid))
        eio_sid = socket.manager.eio_sid_from_sid(sid, "/")
        if eio_sid is not None:
            for ns in ("/dashboard", "/worker", "/notifications"):
                namespace_sid = socket.manager.sid_from_eio_sid(eio_sid, ns)
                if namespace_sid is not None:
                    await socket.disconnect(namespace_sid, namespace=ns, ignore_queue=True)

        # 推送在线用户数到 Dashboard
        count = await redis.scard(online_users_structure) or 0
        await socket.emit("dashboard:online_users", {"count": count}, namespace="/dashboard")
    except Exception:
        logger.warning("Socket Redis disconnect cleanup failed user_id={}", user.id if user else None)


async def renew_session_keys_loop() -> None:
    """Periodically renew TTL on Redis keys for all active Engine.IO sessions."""
    interval = SESSION_TTL // 3
    while True:
        try:
            redis = RedisManager.client()
            for eio_sid in set(socket.eio.sockets):
                sid = socket.manager.sid_from_eio_sid(eio_sid, "/")
                if sid is None:
                    continue
                sid_key = sid_user_structure.format(sid=sid)
                user_data = await redis.hgetall(sid_key, response_model=RedisUser)
                if not user_data or not user_data.id:
                    continue
                if user_data.impersonation_session_id:
                    if user_data.expires_at is None or user_data.expires_at <= time.time():
                        await socket.disconnect(sid)
                    continue
                await redis.expire(sid_key, SESSION_TTL)
                await redis.expire(user_sid_structure.format(user_id=user_data.id), SESSION_TTL)
                await redis.expire(authenticated_sid_structure.format(sid=sid), SESSION_TTL)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Failed to renew session keys", exc_info=True)

        await asyncio.sleep(interval)
