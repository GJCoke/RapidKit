"""Root namespace permissions and per-socket presence."""

import asyncio

from fastapi_sio_di import SID
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger
from rapidkit_core.realtime import PERMISSION_BROADCAST_ROOM, permission_user_room
from rapidkit_framework.identity import current_identity
from rapidkit_common.deps import RedisDep

from src.sio.app import socket
from src.sio.constants import SESSION_TTL, online_users_structure
from src.sio.presence import mark_offline, mark_online, renew_presence
from src.sio.sessions import IDENTITY_SESSION_KEY


@socket.event
async def connect(sid: SID, redis: RedisDep) -> None:
    identity = current_identity()
    await socket.enter_room(sid, permission_user_room(identity.user_id))
    await socket.enter_room(sid, PERMISSION_BROADCAST_ROOM)
    if not identity.impersonation_session_id:
        await mark_online(redis, identity.user_id, sid)
        count = await redis.scard(online_users_structure) or 0
        await socket.emit('dashboard:online_users', {'count': count}, namespace='/dashboard')


@socket.event
async def disconnect(sid: SID, redis: RedisDep) -> None:
    identity = current_identity()
    if not identity.user_id or identity.impersonation_session_id:
        return
    try:
        await mark_offline(redis, identity.user_id, sid)
        count = await redis.scard(online_users_structure) or 0
        await socket.emit('dashboard:online_users', {'count': count}, namespace='/dashboard')
    except Exception:
        logger.warning('Socket Redis disconnect cleanup failed user_id={}', identity.user_id)


async def renew_session_keys_loop() -> None:
    while True:
        try:
            entries: dict[str, list[str]] = {}
            for eio_sid in set(socket.eio.sockets):
                sid = socket.manager.sid_from_eio_sid(eio_sid, '/')
                if sid is None:
                    continue
                try:
                    session = await socket.get_session(sid, namespace='/')
                except KeyError:
                    continue
                identity = session.get(IDENTITY_SESSION_KEY)
                if identity and identity.user_id and not identity.impersonation_session_id:
                    entries.setdefault(identity.user_id, []).append(sid)
            await renew_presence(RedisManager.client(), entries)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug('Failed to renew socket presence')
        await asyncio.sleep(SESSION_TTL // 3)
