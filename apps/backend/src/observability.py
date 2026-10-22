"""Optional error reporting with request/task isolation and a strict privacy boundary."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING
from urllib.parse import urlsplit, urlunsplit

import sentry_sdk
from celery.exceptions import Ignore, Reject, Retry
from rapidkit_core.config import settings
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_framework.identity import current_identity
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.loguru import LoguruIntegration

if TYPE_CHECKING:
    from starlette.requests import Request

_initialized_pid: int | None = None
_CONTEXT_HINT = "rapidkit_context"
_PRIVATE_KEYS = frozenset(
    {
        "authorization",
        "cookie",
        "cookies",
        "x-refresh-token",
        "password",
        "token",
        "access_token",
        "refresh_token",
        "username",
        "email",
        "ip_address",
        "vars",
        "query_string",
        "http.query",
        "url.query",
        "args",
        "kwargs",
    }
)


def _clean_url(value: str) -> str:
    try:
        parts = urlsplit(value)
        host = parts.hostname or ""
        if ":" in host:
            host = f"[{host}]"
        if parts.port is not None:
            host += f":{parts.port}"
        return urlunsplit((parts.scheme, host, parts.path, "", ""))
    except ValueError:
        return "[Filtered]"


def _scrub(value):
    if isinstance(value, dict):
        return {
            key: _clean_url(item)
            if key.lower() in {"url", "http.url", "url.full", "http.target"} and isinstance(item, str)
            else _scrub(item)
            for key, item in value.items()
            if key.lower() not in _PRIVATE_KEYS
        }
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    return value


def before_send(event, hint):
    event = _scrub(event)
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("data", None)
        request.pop("env", None)
    trusted = hint.get(_CONTEXT_HINT, {})
    user_id = trusted.get("user_id") or current_identity().user_id
    request_id = trusted.get("request_id") or get_request_nanoid()
    event.setdefault("tags", {})["request_id"] = request_id
    if user_id:
        event["user"] = {"id": str(user_id)}
    else:
        event.pop("user", None)
    return event


def init_sentry() -> None:
    global _initialized_pid
    if not settings.SENTRY_DSN or _initialized_pid == os.getpid():
        return
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT.value,
        release=settings.SENTRY_RELEASE,
        sample_rate=settings.SENTRY_ERROR_SAMPLE_RATE,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        integrations=[FastApiIntegration(), CeleryIntegration(), LoguruIntegration()],
        before_send=before_send,
        before_send_transaction=before_send,
    )
    _initialized_pid = os.getpid()


def _processor(request: "Request | None", request_id: str):
    def process(event, hint):
        user_id = current_identity().user_id
        if request is not None:
            auth = getattr(request.state, "auth", None)
            subject = getattr(auth, "subject", None)
            user_id = getattr(auth, "subject_user_id", None) or (
                vars(subject).get("id") if subject is not None else None
            )
        hint[_CONTEXT_HINT] = {"user_id": user_id, "request_id": request_id}
        return event

    return process


@contextmanager
def sentry_scope(request: "Request | None" = None) -> Iterator[None]:
    if not sentry_sdk.is_initialized():
        yield
        return
    with sentry_sdk.isolation_scope() as scope:
        scope.add_event_processor(_processor(request, get_request_nanoid()))
        try:
            yield
        except Retry, Ignore, Reject:
            raise
        except Exception as exc:
            # Capture before context teardown; SDK deduplication suppresses the outer integration's duplicate.
            sentry_sdk.capture_exception(exc)
            raise
