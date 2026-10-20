"""Authenticate handshakes and restore trusted identity for dispatched events."""

import base64
import json
import math
import time

from fastapi_sio_di import AsyncServer
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from rapidkit_framework.services import get_service
from rapidkit_common.protocols.auth import CurrentUserProvider
from socketio.exceptions import ConnectionRefusedError

from src.sio.sessions import IDENTITY_SESSION_KEY, register_socket, session_expiry, unregister_socket

PROTECTED_NAMESPACES = frozenset({'/', '/worker', '/notifications', '/dashboard', '/chat'})


def token_expiry(token: str) -> int | None:
    try:
        _, payload, _ = token.split('.')
        exp = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['exp']
        if isinstance(exp, bool) or not isinstance(exp, (int, float)) or not math.isfinite(exp):
            return None
        return int(exp)
    except (ValueError, KeyError, TypeError, OverflowError):
        return None


async def authenticate(auth: object) -> tuple[IdentityMetadata, int]:
    if not isinstance(auth, dict) or not isinstance(auth.get('access_token'), str) or not auth['access_token'].strip():
        raise ConnectionRefusedError('unauthorized')
    token = auth['access_token']
    expires_at = token_expiry(token)
    if expires_at is not None and expires_at <= time.time():
        raise ConnectionRefusedError('token_expired')
    context = await get_service(CurrentUserProvider).get_auth_context(token)
    if context is None or expires_at is None:
        raise ConnectionRefusedError('unauthorized')
    session_id = context.impersonation_session_id
    if session_id is not None:
        expires_at = min(expires_at, await session_expiry(session_id))
        if expires_at <= time.time():
            raise ConnectionRefusedError('unauthorized')
    return IdentityMetadata(
        user_id=str(context.subject.id), actor_id=str(context.actor.id),
        impersonation_session_id=str(session_id) if session_id is not None else None,
    ), expires_at


class IdentityAwareAsyncServer(AsyncServer):
    async def _trigger_event(self, event, namespace, *args):
        if namespace not in PROTECTED_NAMESPACES or event not in {'connect', 'disconnect'}:
            return await super()._trigger_event(event, namespace, *args)
        sid = args[0]
        identity = IdentityMetadata()
        if event == 'disconnect':
            try:
                try:
                    session = await self.get_session(sid, namespace=namespace)
                    identity = session.get(IDENTITY_SESSION_KEY) or identity
                except KeyError:
                    pass
                with identity_scope(identity):
                    return await super()._trigger_event(event, namespace, *args)
            finally:
                await unregister_socket(self, RedisManager.client(), sid, namespace)
        redis = None
        try:
            identity, expires_at = await authenticate(args[2] if len(args) > 2 else None)
            redis = RedisManager.client()
            await register_socket(self, redis, sid, namespace, identity, expires_at)
            with identity_scope(identity):
                result = await super()._trigger_event(event, namespace, *args)
            if result is False:
                raise ConnectionRefusedError('forbidden')
            return result
        except Exception as exc:
            await unregister_socket(self, redis, sid, namespace)
            reason = exc.error_args.get('message') if isinstance(exc, ConnectionRefusedError) else None
            logger.warning('Socket authentication refused namespace={} reason={} user_id={}', namespace, reason, identity.user_id)
            if isinstance(exc, ConnectionRefusedError):
                raise
            raise ConnectionRefusedError() from exc

    async def _handle_event_internal(self, server, sid, eio_sid, data, namespace, id):
        try:
            session = await self.get_session(sid, namespace=namespace)
        except KeyError:
            return None
        metadata = session.get(IDENTITY_SESSION_KEY)
        if namespace in PROTECTED_NAMESPACES and metadata is None:
            return None
        with identity_scope(metadata or IdentityMetadata()):
            return await super()._handle_event_internal(server, sid, eio_sid, data, namespace, id)
