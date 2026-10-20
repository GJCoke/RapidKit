"""Socket identity indexing and fixed expiry across namespaces and processes."""

import asyncio
import json
import math
import time
from uuid import UUID

from rapidkit_core.log import logger
from rapidkit_core.realtime import get_external_sio
from rapidkit_framework.identity import IdentityMetadata
from rapidkit_framework.services import get_service, service_registry
from rapidkit_common.protocols.auth import UserSocketCloser
from rapidkit_common.protocols.impersonation import ImpersonationSessionReader, ImpersonationSocketCloser
from socketio.exceptions import ConnectionRefusedError

from src.sio.constants import SESSION_TTL, user_sockets_structure

_timers: dict[tuple[str, str], asyncio.Task] = {}
_timer_tasks: set[asyncio.Task] = set()
REMOTE_CLEANUP_TIMEOUT_SECONDS = 2.0
IDENTITY_SESSION_KEY = "trusted_identity"


def socket_member(namespace: str, sid: str) -> str:
    return json.dumps({"namespace": namespace, "sid": sid}, separators=(",", ":"))


def sockets_key(session_id: UUID | str) -> str:
    return f"auth:impersonation:<{session_id}>:sockets"


class RedisSocketCloser:
    def __init__(self, server=None):
        self.server = server if server is not None else get_external_sio()

    async def close_session(self, session_id, redis):
        key = sockets_key(session_id)
        for member in await redis.smembers(key):
            item = json.loads(member)
            await self.server.emit("auth:revoked", {"code": "unauthorized"}, to=item["sid"], namespace=item["namespace"])
            await self.server.disconnect(item["sid"], namespace=item["namespace"])
        await redis.delete(key)

    async def close_user(self, user_id, redis, *, namespaces=None, reason="unauthorized"):
        key = user_sockets_structure.format(user_id=user_id)
        for member in await redis.smembers(key):
            item = json.loads(member)
            if namespaces and item["namespace"] not in namespaces:
                continue
            await self.server.emit("auth:revoked", {"code": reason}, to=item["sid"], namespace=item["namespace"])
            await self.server.disconnect(item["sid"], namespace=item["namespace"])
            await redis.srem(key, member)


def register_socket_closer():
    closer = RedisSocketCloser()
    service_registry.register(ImpersonationSocketCloser, closer)
    service_registry.register(UserSocketCloser, closer)


async def session_expiry(session_id: UUID) -> int:
    expiry = await get_service(ImpersonationSessionReader).get_expiry(session_id)
    if expiry is None:
        raise ConnectionRefusedError("unauthorized")
    return expiry


async def register_socket(server, redis, sid: str, namespace: str, identity: IdentityMetadata, expires_at: int) -> None:
    member = socket_member(namespace, sid)
    keys = [user_sockets_structure.format(user_id=identity.user_id)]
    if identity.impersonation_session_id:
        keys.append(sockets_key(identity.impersonation_session_id))
    try:
        for key in keys:
            await redis.sadd(key, member)
            ttl = max(1, math.ceil(expires_at - time.time()) + SESSION_TTL)
            # The shortest-lived connection must not expire the shared registry early.
            await redis.expire(key, ttl, nx=True)
            await redis.expire(key, ttl, gt=True)
        if identity.impersonation_session_id:
            valid = await get_service(ImpersonationSessionReader).validate_identity(
                UUID(identity.impersonation_session_id), UUID(identity.actor_id), UUID(identity.user_id), expires_at
            )
            if not valid:
                raise ConnectionRefusedError("unauthorized")
        await server.save_session(sid, {IDENTITY_SESSION_KEY: identity}, namespace=namespace)
    except Exception:
        for key in keys:
            try:
                async with asyncio.timeout(REMOTE_CLEANUP_TIMEOUT_SECONDS):
                    await redis.srem(key, member)
            except Exception:
                logger.warning("Rejected socket cleanup failed user_id={}", identity.user_id)
        raise
    cancel_socket_timer(sid, namespace)
    timer_key = (namespace, sid)

    async def expire():
        try:
            await asyncio.sleep(max(0, expires_at - time.time()))
            try:
                try:
                    await server.emit("auth:revoked", {"code": "token_expired"}, to=sid, namespace=namespace)
                finally:
                    await server.disconnect(sid, namespace=namespace, ignore_queue=True)
            finally:
                if identity.impersonation_session_id:
                    try:
                        async with asyncio.timeout(REMOTE_CLEANUP_TIMEOUT_SECONDS):
                            await RedisSocketCloser().close_session(identity.impersonation_session_id, redis)
                    except Exception:
                        logger.warning("Socket session remote expiry cleanup failed user_id={}", identity.user_id)
        finally:
            if _timers.get(timer_key) is asyncio.current_task():
                _timers.pop(timer_key, None)

    task = asyncio.create_task(expire())
    _timers[timer_key] = task
    _timer_tasks.add(task)
    task.add_done_callback(_timer_tasks.discard)


def cancel_socket_timer(sid, namespace):
    task = _timers.pop((namespace, sid), None)
    if task is not None and task is not asyncio.current_task():
        task.cancel()


async def shutdown_socket_timers():
    tasks = tuple(_timer_tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _timer_tasks.clear()
    _timers.clear()


async def unregister_socket(server, redis, sid, namespace):
    cancel_socket_timer(sid, namespace)
    identity = None
    try:
        session = await server.get_session(sid, namespace=namespace)
        identity = session.get(IDENTITY_SESSION_KEY)
        if identity:
            await redis.srem(user_sockets_structure.format(user_id=identity.user_id), socket_member(namespace, sid))
            if identity.impersonation_session_id:
                await redis.srem(sockets_key(identity.impersonation_session_id), socket_member(namespace, sid))
    except Exception:
        logger.warning("Socket identity cleanup failed namespace={} user_id={}", namespace, identity.user_id if identity else None)
