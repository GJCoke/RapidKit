from fastapi_sio_di import SID

from src.common.deps import RedisDep
from src.common.schemas import BaseModel
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
    user = await redis.get_mapping("sid:<{sid}>:user".format(sid=sid))
    print(f"{user} sent a message: {data.msg}")
    await socket.send(MessageResponse(user=RedisUser(**user), send=data), room=sid)
