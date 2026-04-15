import json

from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode
from slowapi import Limiter
from slowapi.middleware import _find_route_handler, _should_exempt, sync_check_limits
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SlowAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        app: Starlette = request.app
        limiter: Limiter = app.state.limiter

        if not limiter.enabled:
            return await call_next(request)

        handler = _find_route_handler(app.routes, request.scope)
        if _should_exempt(limiter, handler):
            return await call_next(request)

        error_response, should_inject_headers = sync_check_limits(limiter, request, handler, app)
        if error_response is not None:
            return Response(
                json.dumps(
                    AppException(StatusCode.TOO_MANY_REQUESTS).dump(),
                    ensure_ascii=False,
                ),
                media_type="application/json",
            )

        response = await call_next(request)
        if should_inject_headers:
            response = limiter._inject_headers(response, request.state.view_rate_limit)
        return response
