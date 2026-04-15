import json

from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette_context import request_cycle_context
from starlette_context.errors import MiddleWareValidationError
from starlette_context.middleware import ContextMiddleware as StarletteContextMiddleware

from src.locales.i18n import t
from src.locales.types import languages
from src.locales.utils import resolve_language


class ContextMiddleware(StarletteContextMiddleware):
    """自定义上下文中间件，扩展了 starlette-context 的功能，以支持基于请求的国际化错误响应。"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            context = await self.set_context(request)
        except MiddleWareValidationError:
            error = AppException(StatusCode.BAD_REQUEST)
            language = resolve_language(request.headers.get("accept-language"), languages)

            return Response(
                json.dumps(
                    {
                        "code": error.code,
                        "message": t(str(StatusCode.BAD_REQUEST), language),  # type: ignore
                        "data": error.data,
                    },
                    ensure_ascii=False,
                ),
                media_type="application/json",
            )

        with request_cycle_context(context):
            response = await call_next(request)
            for plugin in self.plugins:
                await plugin.enrich_response(response)
            return response
