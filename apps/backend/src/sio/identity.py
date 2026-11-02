"""Authenticate handshakes and restore trusted identity for dispatched events."""

import base64
import json
import math
import time
from typing import cast

from fastapi_sio_di import AsyncServer
from nanoid import generate
from rapidkit_common.protocols.auth import CurrentUserProvider
from rapidkit_core.database import RedisManager
from rapidkit_core.log import logger
from rapidkit_core.nanoid import request_id_scope
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from rapidkit_framework.services import get_service
from socketio.exceptions import ConnectionRefusedError

from src.sio.observability import connection_event, connection_fields, expected_error, socket_event_scope
from src.sio.sessions import IDENTITY_SESSION_KEY, register_socket, session_expiry, unregister_socket

PROTECTED_NAMESPACES = frozenset({"/", "/worker", "/notifications", "/dashboard", "/chat"})


def token_expiry(token: str) -> float | None:
    try:
        _, payload, _ = token.split(".")
        exp = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["exp"]
        if isinstance(exp, bool) or not isinstance(exp, (int, float)) or not math.isfinite(exp):
            return None
        return float(exp)
    except ValueError, KeyError, TypeError, OverflowError:
        return None


async def authenticate(auth: object, *, fresh: bool = False) -> tuple[IdentityMetadata, float]:
    token = cast(dict[str, object], auth).get("access_token") if isinstance(auth, dict) else None
    if not isinstance(token, str) or not token.strip():
        raise ConnectionRefusedError("unauthorized")
    expires_at = token_expiry(token)
    if expires_at is not None and expires_at <= time.time():
        raise ConnectionRefusedError("token_expired")
    context = await get_service(CurrentUserProvider).get_auth_context(token, fresh=fresh)
    if context is None or expires_at is None:
        raise ConnectionRefusedError("unauthorized")
    session_id = context.impersonation_session_id
    if session_id is not None:
        expires_at = min(expires_at, await session_expiry(session_id))
        if expires_at <= time.time():
            raise ConnectionRefusedError("unauthorized")
    return IdentityMetadata(
        user_id=str(context.subject.id),
        actor_id=str(context.actor.id),
        impersonation_session_id=str(session_id) if session_id is not None else None,
    ), expires_at


class IdentityAwareAsyncServer(AsyncServer):
    def __init__(self, *args, **kwargs):
        self._pending_admissions: set[tuple[str, str]] = set()
        super().__init__(*args, **kwargs)

    async def _trigger_event(self, event, namespace, *args):
        if namespace not in PROTECTED_NAMESPACES or event not in {"connect", "disconnect"}:
            return await super()._trigger_event(event, namespace, *args)
        with request_id_scope(generate()), logger.contextualize(**connection_fields(args[0], namespace)):
            return await self._trigger_lifecycle(event, namespace, *args)

    async def _trigger_lifecycle(self, event, namespace, *args):
        sid = args[0]
        identity = IdentityMetadata()
        if event == "disconnect":
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
                reason = args[1] if len(args) > 1 else None
                reason = (
                    reason.replace(" ", "_")
                    if reason
                    in {"client disconnect", "server disconnect", "transport close", "transport error", "ping timeout"}
                    else "other"
                )
                connection_event("socket.disconnected", sid, namespace, identity, reason)
        redis = None
        self._pending_admissions.add((namespace, sid))
        try:
            identity, expires_at = await authenticate(args[2] if len(args) > 2 else None)
            redis = RedisManager.client()
            await register_socket(self, redis, sid, namespace, identity, expires_at)
            # Revocation before indexing must reject admission; after indexing it can find and close us.
            checked_identity, _ = await authenticate(args[2] if len(args) > 2 else None, fresh=True)
            if checked_identity != identity:
                raise ConnectionRefusedError("unauthorized")
            with identity_scope(identity):
                result = await super()._trigger_event(event, namespace, *args)
            if result is False:
                raise ConnectionRefusedError("forbidden")
            connection_event("socket.connected", sid, namespace, identity)
            return result
        except Exception as exc:
            await unregister_socket(self, redis, sid, namespace)
            reason = exc.error_args.get("message") if isinstance(exc, ConnectionRefusedError) else None
            connection_event(
                "socket.auth.rejected",
                sid,
                namespace,
                identity,
                reason if reason in {"unauthorized", "forbidden", "token_expired"} else "authentication_failed",
            )
            if isinstance(exc, ConnectionRefusedError):
                raise
            raise ConnectionRefusedError() from exc
        finally:
            self._pending_admissions.discard((namespace, sid))

    async def _handle_event_internal(self, server, sid, eio_sid, data, namespace, id):
        if (namespace, sid) in self._pending_admissions:
            return None
        try:
            session = await self.get_session(sid, namespace=namespace)
        except KeyError:
            return None
        metadata = session.get(IDENTITY_SESSION_KEY)
        if namespace in PROTECTED_NAMESPACES and metadata is None:
            return None
        metadata = metadata or IdentityMetadata()
        name = data[0] if data and isinstance(data[0], str) and data[0] in self.handlers.get(namespace, {}) else "other"
        with identity_scope(metadata), socket_event_scope(sid, namespace, name, metadata) as event_id:
            try:
                return await super()._handle_event_internal(server, sid, eio_sid, data, namespace, id)
            except Exception as error:
                if not expected_error(error):
                    try:
                        await self.emit(
                            "diagnostic:error",
                            {"requestId": event_id, "code": "unexpected_error"},
                            to=sid,
                            namespace=namespace,
                            ignore_queue=True,
                        )
                    except Exception:
                        pass
                raise
