"""Restore trusted handshake identity for independently dispatched event tasks."""

from fastapi_sio_di import AsyncServer
from rapidkit_core.log import logger
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from socketio.exceptions import ConnectionRefusedError

from src.sio.impersonation import IDENTITY_SESSION_KEY, cancel_socket_timer


class IdentityAwareAsyncServer(AsyncServer):
    async def _trigger_event(self, event, namespace, *args):
        try:
            return await super()._trigger_event(event, namespace, *args)
        except ConnectionRefusedError:
            if event == "connect" and args:
                cancel_socket_timer(args[0], namespace)
            raise
        except Exception as exc:
            if event != "connect":
                raise
            if args:
                cancel_socket_timer(args[0], namespace)
            logger.warning("Socket authentication failed namespace={} user_id={}", namespace, None)
            raise ConnectionRefusedError() from exc

    async def _handle_event_internal(self, server, sid, eio_sid, data, namespace, id):
        try:
            session = await self.get_session(sid, namespace=namespace)
        except KeyError:
            return None
        metadata = session.get(IDENTITY_SESSION_KEY)
        if namespace in {"/", "/worker", "/notifications", "/dashboard"} and metadata is None:
            return None
        metadata = metadata or IdentityMetadata()
        with identity_scope(metadata):
            return await super()._handle_event_internal(server, sid, eio_sid, data, namespace, id)
