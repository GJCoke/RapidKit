"""Socket evidence contains identities and opaque IDs, never handshake/event data."""

import asyncio
import re
import time
from contextlib import contextmanager

import sentry_sdk
from nanoid import generate
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.nanoid import request_id_scope
from rapidkit_framework.exceptions import AppException
from socketio.exceptions import ConnectionRefusedError

from src.observability import sentry_scope

NAMESPACES = frozenset({"/", "/worker", "/notifications", "/dashboard", "/chat"})


def connection_fields(sid, namespace):
    return {
        "socket_connection_id": sid if isinstance(sid, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", sid) else "-",
        "namespace": namespace if namespace in NAMESPACES else "other",
    }


def connection_event(event, sid, namespace, identity, reason=None):
    fields = connection_fields(sid, namespace)
    fields.update(
        user_id=identity.user_id, actor_id=identity.actor_id, impersonation_session_id=identity.impersonation_session_id
    )
    logger.bind(event=event, reason_code=reason, **fields).log(
        "WARNING" if event == "socket.auth.rejected" else "INFO", "Socket lifecycle"
    )


def expected_error(error):
    return isinstance(error, (AppException, ConnectionRefusedError))


@contextmanager
def socket_event_scope(sid, namespace, event_name, identity):
    event_id, started = generate(), time.perf_counter()
    with (
        request_id_scope(event_id),
        logger.contextualize(
            **connection_fields(sid, namespace),
            socket_event_id=event_id,
            event_name=event_name,
            user_id=identity.user_id,
            actor_id=identity.actor_id,
            impersonation_session_id=identity.impersonation_session_id,
        ),
    ):
        error = None
        try:
            yield event_id
        except BaseException as exc:
            error = exc
            raise
        finally:
            duration = (time.perf_counter() - started) * 1000
            try:
                if error is not None:
                    logger.bind(
                        event="socket.event.failed",
                        duration_ms=round(duration, 3),
                        outcome="cancelled" if isinstance(error, asyncio.CancelledError) else "error",
                        error_kind="business" if expected_error(error) else "server",
                        exception_type=type(error).__name__,
                    ).warning("Socket event failed")
                    if isinstance(error, Exception) and not expected_error(error) and sentry_sdk.is_initialized():
                        with sentry_scope():
                            sentry_sdk.capture_exception(error)
                elif duration >= settings.SLOW_SOCKET_EVENT_THRESHOLD_MS:
                    logger.bind(event="socket.event.slow", duration_ms=round(duration, 3), outcome="success").warning(
                        "Socket event slow"
                    )
            except Exception:
                pass
