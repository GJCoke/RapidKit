"""Observe the complete ASGI request, including FastAPI's final error response."""

import asyncio
import re
import time
from typing import TYPE_CHECKING

from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.nanoid import NanoIdPlugin, WrongNanoIdError, request_id_scope
from rapidkit_framework.context import classify_request, request_state_scope
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.health import is_internal_path
from src.middlewares import metrics as redis_metrics

if TYPE_CHECKING:
    from src.prometheus import HTTPMetrics


class LoggerMiddleware:
    def __init__(self, app: ASGIApp, *, metrics: "HTTPMetrics | None" = None, record_redis: bool = False):
        self.app, self.metrics, self.record_redis = app, metrics, record_redis

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        state = dict(scope.get("state", {}))
        scope["state"] = state
        headers = Headers(scope=scope)
        plugin = NanoIdPlugin()
        supplied = headers.get("X-Request-ID")
        request_id = plugin.get_new_nanoid()
        if supplied:
            try:
                plugin.validate_nanoid(supplied)
                if len(headers.getlist("X-Request-ID")) != 1:
                    raise WrongNanoIdError("Duplicate request ID")
                request_id = supplied
            except WrongNanoIdError:
                state["invalid_request_id"] = True
        state["request_id"] = request_id
        edge = headers.get("X-Edge-Request-ID", "")
        edge_id = edge if re.fullmatch("[a-f0-9]{32}", edge) else None
        internal = is_internal_path(scope["path"])
        status, header_duration, complete, failed, disconnected = None, None, False, False, False
        sent_business_code = None
        if self.metrics is not None and not internal:
            self.metrics.in_progress.inc()

        async def observe_receive() -> Message:
            nonlocal disconnected
            message = await receive()
            if message["type"] == "http.disconnect":
                disconnected = True
            return message

        async def observe_send(message: Message) -> None:
            nonlocal status, header_duration, complete, sent_business_code
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            try:
                await send(message)
            except BaseException:
                state["error_kind"] = "transport"
                raise
            if message["type"] == "http.response.start":
                status = message["status"]
                sent_business_code = state.get("business_code")
                header_duration = (time.perf_counter() - started) * 1000
            elif message["type"] == "http.response.body" and not message.get("more_body", False):
                complete = True

        with request_id_scope(request_id), request_state_scope(state):
            try:
                await self.app(scope, observe_receive, observe_send)
            except BaseException as exc:
                failed = True
                if isinstance(exc, asyncio.CancelledError):
                    state["error_kind"] = "cancelled"
                raise
            finally:
                if not complete and not failed:
                    failed = True
                    state["error_kind"] = "transport" if disconnected else "server"
                outcome, kind = classify_request({**state, "business_code": sent_business_code}, status, failed)
                duration = (time.perf_counter() - started) * 1000
                route = getattr(scope.get("route"), "path", "unmatched")
                auth = state.get("auth")
                subject = getattr(auth, "subject", None)
                actor = getattr(auth, "actor", None)
                fields = dict(
                    event="http.request.completed",
                    request_id=request_id,
                    edge_request_id=edge_id,
                    method=scope["method"],
                    route=route,
                    http_status=status,
                    business_code=sent_business_code,
                    outcome=outcome,
                    error_kind=kind,
                    duration_ms=round(duration, 3),
                    header_duration_ms=header_duration,
                    response_complete=complete,
                    processing_failed=failed,
                    user_id=getattr(auth, "subject_user_id", None)
                    or (vars(subject).get("id") if subject is not None else None),
                    actor_id=getattr(auth, "actor_id", None) or (vars(actor).get("id") if actor is not None else None),
                    impersonation_session_id=getattr(auth, "impersonation_session_id", None),
                )
                if not internal or outcome == "error":
                    logger.bind(**fields).info('"{} {}" {} {}ms', scope["method"], route, status, round(duration))
                    if duration > settings.SLOW_REQUEST_THRESHOLD_MS:
                        logger.bind(**{**fields, "event": "http.request.slow"}).warning("Slow request")
                if self.metrics is not None and not internal:
                    self.metrics.in_progress.dec()
                    self.metrics.observe_request(scope["method"], route, outcome, kind, duration / 1000)
                if self.record_redis and not internal:
                    if len(redis_metrics._background_tasks) >= redis_metrics.MAX_IN_FLIGHT:
                        redis_metrics.record_dropped(RuntimeError("Request metrics capacity exhausted"))
                    else:
                        task = asyncio.create_task(
                            redis_metrics._record_metrics(
                                status_code=status or 0,
                                duration_ms=duration,
                                path=route,
                                route_path=route,
                                method=scope["method"],
                                business_code=sent_business_code,
                                outcome=outcome,
                            )
                        )
                        redis_metrics._background_tasks.add(task)
                        task.add_done_callback(redis_metrics._background_tasks.discard)
