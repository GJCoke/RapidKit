"""
Author  : Coke
Date    : 2025-05-16
"""

from typing import Literal

from authlib.jose.errors import ExpiredTokenError, JoseError
from fastapi_sio_di import SID

from src.core.config import auth_settings
from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.deps.auth import AuthCrudDep
from src.deps.database import RedisDep
from src.schemas import BaseModel
from src.sio.app import socket
from src.utils.security import decode_token

user_sid_structure = "user:<{user_id}>:sid"
sid_user_structure = "sid:<{sid}>:user"
online_users_structure = "online_users"


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
async def connect(sid: SID, auth: AccessToken, db_user: AuthCrudDep, redis: RedisDep) -> Literal[False] | None:
    """
    处理 websocket 连接事件。

    Args:
        sid: 会话ID。
        auth: 访问令牌对象。
        db_user: 用户数据库依赖。
        redis: Redis 依赖。

    Returns:
        None 或 False，表示连接是否成功。
    """
    token = auth.access_token
    if not token:
        return False

    try:
        user = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
    except ExpiredTokenError:
        raise AppException(StatusCode.TOKEN_EXPIRED)
    except JoseError:
        raise AppException(StatusCode.TOKEN_INVALID)

    user_info = await db_user.get(user.sub)
    if not user_info:
        return False

    user_id = str(user_info.id)
    await redis.set(sid_user_structure.format(sid=sid), RedisUser(id=user_id, name=user_info.name).model_dump())
    await redis.set(user_sid_structure.format(user_id=user_id), sid)
    await redis.set(online_users_structure, {user_id})

    return None


@socket.event
async def disconnect(sid: SID, redis: RedisDep) -> None:
    """
    处理 websocket 断开连接事件。

    Args:
        sid: 会话ID。
        redis: Redis 依赖。
    """
    user = await redis.get_mapping(sid_user_structure.format(sid=sid))
    user_info = RedisUser.model_validate(user)
    await redis.delete(sid_user_structure.format(sid=sid))
    await redis.delete(user_sid_structure.format(user_id=user_info.id))
    await redis.delete_set(online_users_structure, user_info.id)
