"""Response headers and a streaming request-body limit before body-reading middleware.

Author : Codex
Date   : 2026-10-23
"""

from typing import cast

from rapidkit_core.config import settings
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.locales.i18n import t
from src.locales.types import LANGUAGE_TYPE, I18nKey, languages
from src.locales.utils import resolve_language


def security_headers(scheme: str) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
    }
    if settings.SECURITY_HSTS_ENABLED and scheme == "https":
        headers["Strict-Transport-Security"] = "max-age=31536000"
    return headers


class _BodyLimitExceeded(AppException):
    def __init__(self) -> None:
        super().__init__(StatusCode.REQUEST_BODY_TOO_LARGE)


class SecurityMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        limit = settings.MAX_REQUEST_BODY_BYTES
        secure = security_headers(scope.get("scheme", "http"))

        async def reject(code: StatusCode) -> None:
            scope.setdefault("state", {})["business_code"] = int(code)
            language = resolve_language(headers.get("accept-language"), languages) or settings.DEFAULT_LANGUAGE
            response = JSONResponse(
                {
                    "code": int(code),
                    "message": t(cast(I18nKey, code.description), language=cast(LANGUAGE_TYPE, language)),
                    "data": None,
                },
                headers=secure,
            )
            await response(scope, receive, send)

        lengths = headers.getlist("content-length")
        values = [length.strip() for length in lengths]
        if values:
            if (
                any(not value.isascii() or not value.isdecimal() for value in values)
                or len(set(values)) != 1
                or headers.get("transfer-encoding")
            ):
                await reject(StatusCode.BAD_REQUEST)
                return
            # Compare decimal strings, avoiding Python's untrusted integer digit limit.
            value = values[0].lstrip("0") or "0"
            maximum = str(limit)
            if len(value) > len(maximum) or (len(value) == len(maximum) and value > maximum):
                await reject(StatusCode.REQUEST_BODY_TOO_LARGE)
                return

        received = 0
        exceeded = False
        started = False
        rejected = False

        async def bounded_receive() -> Message:
            nonlocal received, exceeded
            if exceeded:
                raise _BodyLimitExceeded()
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    raise _BodyLimitExceeded()
            return message

        async def secure_send(message: Message) -> None:
            nonlocal started, rejected
            if rejected:
                return
            if message["type"] == "http.response.start":
                if exceeded:
                    rejected = True
                    await reject(StatusCode.REQUEST_BODY_TOO_LARGE)
                    return
                started = True
                response_headers = MutableHeaders(scope=message)
                for name, value in secure.items():
                    response_headers[name] = value
            await send(message)

        try:
            await self.app(scope, bounded_receive, secure_send)
        except Exception:
            if not exceeded or started:
                raise
            if not rejected:
                await reject(StatusCode.REQUEST_BODY_TOO_LARGE)
