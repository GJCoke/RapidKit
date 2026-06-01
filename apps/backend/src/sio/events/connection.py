"""
Author  : Coke
Date    : 2025-05-16
"""

import asyncio
from typing import Literal

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_common.protocols.auth import CurrentUserProvider
from rapidkit_common.schemas import BaseModel
from rapidkit_core.log import logger
from rapidkit_framework.services import get_service

from src.sio.app import socket
from src.sio.constants import (
    SESSION_TTL,
    authenticated_sid_structure,
    online_users_structure,
    sid_user_structure,
    user_sid_structure,
)


class RedisUser(BaseModel):
    """
    Redis 用户模型。
    """

    id: str
    name: str


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
    user_info = await current_user_provider.get_current_user(token)
    if not user_info:
        return False

    user_id = str(user_info.id)
    sid_key = sid_user_structure.format(sid=sid)
    await redis.hset(sid_key, mapping=RedisUser(id=user_id, name=user_info.name))
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
    user = await redis.hgetall(sid_user_structure.format(sid=sid), response_model=RedisUser)
    await redis.delete(sid_user_structure.format(sid=sid))
    if not user or not user.id:
        return
    await redis.delete(user_sid_structure.format(user_id=user.id))
    await redis.srem(online_users_structure, user.id)
    await redis.delete(authenticated_sid_structure.format(sid=sid))
    for ns in ("/dashboard", "/worker"):
        await socket.disconnect(sid, namespace=ns)

    # 推送在线用户数到 Dashboard
    count = await redis.scard(online_users_structure) or 0
    await socket.emit("dashboard:online_users", {"count": count}, namespace="/dashboard")


async def renew_session_keys_loop() -> None:
    """Periodically renew TTL on Redis keys for all active Engine.IO sessions."""
    from rapidkit_core.database import RedisManager

    interval = SESSION_TTL // 3
    while True:
        try:
            redis = RedisManager.client()
            active_sids = set(socket.eio.sockets)
            for sid in active_sids:
                sid_key = sid_user_structure.format(sid=sid)
                user_data = await redis.hgetall(sid_key, response_model=RedisUser)
                if not user_data or not user_data.id:
                    continue
                await redis.expire(sid_key, SESSION_TTL)
                await redis.expire(user_sid_structure.format(user_id=user_data.id), SESSION_TTL)
                await redis.expire(authenticated_sid_structure.format(sid=sid), SESSION_TTL)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Failed to renew session keys", exc_info=True)

        await asyncio.sleep(interval)
