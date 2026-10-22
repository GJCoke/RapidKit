"""Await shared rate counters before dispatching business requests."""

from rapidkit_core.config import settings
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from src.health import is_internal_path


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if is_internal_path(request.url.path):
            return await call_next(request)
        provider = getattr(request.app.state, "rate_limit_rules", None)
        if provider is not None:
            rules = await provider(request)
        else:
            ip = request.client.host if request.client else "unknown"
            rules = [("default", f"ip:{ip}", settings.RATE_LIMIT_ANONYMOUS)]
        retry_after = await request.app.state.limiter.check(rules)
        if retry_after is not None:
            request.state.business_code = int(StatusCode.TOO_MANY_REQUESTS)
            return JSONResponse(
                AppException(StatusCode.TOO_MANY_REQUESTS).dump(),
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
