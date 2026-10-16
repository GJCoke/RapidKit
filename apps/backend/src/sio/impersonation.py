"""Socket identity storage and fixed expiry across namespaces and processes."""

import asyncio
import json
import math
import time
from datetime import UTC
from uuid import UUID

from plugin_auth.impersonation.models import ImpersonationSession
from rapidkit_common.protocols.impersonation import ImpersonationSocketCloser
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import logger
from rapidkit_core.realtime import get_external_sio
from rapidkit_framework.identity import IdentityMetadata
from rapidkit_framework.services import service_registry
from socketio.exceptions import ConnectionRefusedError

from src.sio.constants import SESSION_TTL, authenticated_sid_structure, sid_user_structure

_timers: dict[tuple[str, str], asyncio.Task] = {}
_timer_tasks: set[asyncio.Task] = set()
REMOTE_CLEANUP_TIMEOUT_SECONDS = 2.0
IDENTITY_SESSION_KEY = "trusted_identity"


def socket_member(namespace: str, sid: str) -> str:
    return json.dumps({"namespace": namespace, "sid": sid}, separators=(",", ":"))


def sockets_key(session_id: UUID | str) -> str:
    return f"auth:impersonation:<{session_id}>:sockets"


class RedisImpersonationSocketCloser:
    def __init__(self, server=None):
        self.server = server if server is not None else get_external_sio()

    async def close_session(self, session_id, redis):
        key = sockets_key(session_id)
        for member in await redis.smembers(key):
            item = json.loads(member)
            await self.server.disconnect(item["sid"], namespace=item["namespace"])
        await redis.delete(key)


def register_socket_closer():
    service_registry.register(ImpersonationSocketCloser, RedisImpersonationSocketCloser())


def resolve_root_sid(server, sid: str, namespace: str) -> str | None:
    eio_sid = server.manager.eio_sid_from_sid(sid, namespace)
    return server.manager.sid_from_eio_sid(eio_sid, "/") if eio_sid is not None else None


async def session_expiry(session_id: UUID) -> int:
    async with AsyncSessionLocal() as session:
        record = await session.get(ImpersonationSession, session_id)
        if record is None:
            raise ConnectionRefusedError("Invalid impersonation session")
        return int(record.expires_at.replace(tzinfo=UTC).timestamp())


async def validate_registered_identity(data) -> bool:
    """Validate after indexing so a concurrent stop cannot miss the new SID."""
    async with AsyncSessionLocal() as session:
        record = await session.get(ImpersonationSession, UUID(data["impersonation_session_id"]))
        return bool(
            record is not None
            and record.ended_at is None
            and str(record.actor_id) == data["actor_id"]
            and str(record.subject_user_id) == data["id"]
            and int(record.expires_at.replace(tzinfo=UTC).timestamp()) == int(data["expires_at"])
            and record.expires_at.replace(tzinfo=UTC).timestamp() > time.time()
        )


async def register_impersonated_socket(redis, session_id, namespace, sid, expires_at):
    key = sockets_key(session_id)
    remaining = max(1, math.ceil(expires_at - time.time()))
    await redis.sadd(key, socket_member(namespace, sid))
    await redis.expire(key, remaining + SESSION_TTL)


async def store_socket_identity(server, redis, sid, namespace, data):
    metadata = IdentityMetadata(
        user_id=data["id"],
        actor_id=data.get("actor_id") or data["id"],
        impersonation_session_id=data.get("impersonation_session_id"),
    )
    if metadata.impersonation_session_id is None:
        await server.save_session(sid, {IDENTITY_SESSION_KEY: metadata}, namespace=namespace)
        return
    try:
        expiry = int(data["expires_at"])
        if expiry <= time.time():
            raise ConnectionRefusedError()
        remaining = max(1, math.floor(expiry - time.time()))
        await redis.hset(
            sid_user_structure.format(sid=sid),
            mapping={key: str(value) for key, value in data.items() if value is not None},
        )
        await redis.expire(sid_user_structure.format(sid=sid), remaining)
        await redis.set(authenticated_sid_structure.format(sid=sid), "1", ex=remaining)
        await register_impersonated_socket(redis, metadata.impersonation_session_id, namespace, sid, expiry)
        if not await validate_registered_identity(data):
            raise ConnectionRefusedError()
        # Business events can use this identity only after final handshake validation.
        await server.save_session(sid, {IDENTITY_SESSION_KEY: metadata}, namespace=namespace)
    except Exception as exc:
        try:
            async with asyncio.timeout(REMOTE_CLEANUP_TIMEOUT_SECONDS):
                await redis.srem(sockets_key(metadata.impersonation_session_id), socket_member(namespace, sid))
                await redis.delete(sid_user_structure.format(sid=sid), authenticated_sid_structure.format(sid=sid))
        except Exception:
            logger.warning("Rejected socket cleanup failed user_id={}", metadata.user_id)
        raise ConnectionRefusedError() from exc
    timer_key = (namespace, sid)
    old = _timers.pop(timer_key, None)
    if old is not None and old is not asyncio.current_task():
        old.cancel()

    async def expire():
        try:
            await asyncio.sleep(max(0, expiry - time.time()))
            try:
                await server.disconnect(sid, namespace=namespace, ignore_queue=True)
            finally:
                try:
                    async with asyncio.timeout(REMOTE_CLEANUP_TIMEOUT_SECONDS):
                        await RedisImpersonationSocketCloser().close_session(metadata.impersonation_session_id, redis)
                except Exception:
                    logger.warning("Socket session remote expiry cleanup failed user_id={}", metadata.user_id)
        finally:
            if _timers.get(timer_key) is asyncio.current_task():
                _timers.pop(timer_key, None)

    task = asyncio.create_task(expire())
    _timers[timer_key] = task
    _timer_tasks.add(task)
    task.add_done_callback(_timer_tasks.discard)


async def shutdown_socket_timers():
    tasks = tuple(_timer_tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _timer_tasks.clear()
    _timers.clear()


async def inherit_root_identity(server, redis, sid, namespace):
    root = resolve_root_sid(server, sid, namespace)
    if root is None or not await redis.exists(authenticated_sid_structure.format(sid=root)):
        return None
    data = await redis.hgetall(sid_user_structure.format(sid=root))
    if not isinstance(data, dict) or not data.get("id"):
        return None
    await store_socket_identity(server, redis, sid, namespace, data)
    return data


def cancel_socket_timer(sid, namespace):
    task = _timers.pop((namespace, sid), None)
    if task is not None and task is not asyncio.current_task():
        task.cancel()


async def unregister_socket(server, redis, sid, namespace):
    cancel_socket_timer(sid, namespace)
    identity = None
    try:
        session = await server.get_session(sid, namespace=namespace)
        identity = session.get(IDENTITY_SESSION_KEY)
        if identity and identity.impersonation_session_id:
            await redis.srem(sockets_key(identity.impersonation_session_id), socket_member(namespace, sid))
            await redis.delete(sid_user_structure.format(sid=sid), authenticated_sid_structure.format(sid=sid))
    except Exception:
        logger.warning(
            "Socket identity cleanup failed namespace={} user_id={}", namespace, identity.user_id if identity else None
        )
