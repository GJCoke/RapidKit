from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas import BaseModel

from src.sio.app import socket


class MessageEvent(BaseModel):
    msg: str


class RedisUser(BaseModel):
    """
    Redis 用户模型。
    """

    id: str
    name: str


class MessageResponse(BaseModel):
    user: RedisUser
    send: MessageEvent


@socket.event
async def message(sid: SID, data: MessageEvent, redis: RedisDep) -> None:
    user = await redis.hgetall("sid:<{sid}>:user".format(sid=sid), response_model=RedisUser)
    print(f"{user} sent a message: {data.msg}")
    await socket.send(MessageResponse(user=user, send=data), room=sid)
