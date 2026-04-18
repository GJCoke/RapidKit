from typing import Awaitable, Callable, cast

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.locales.i18n import i18n
from src.locales.types import LANGUAGE_TYPE, languages
from src.locales.utils import resolve_language


class I18nMiddleware(BaseHTTPMiddleware):
    """i18n 中间件"""

    async def dispatch(self, request: Request, callback: Callable[[Request], Awaitable[Response]]) -> Response:
        """
        将请求分派到链中的下一个中间件或端点，根据传入请求的标头重置当前语言。

        Args:
            request: 传入的 HTTP 请求。
            callback: 中间件链中的下一个可调用对象或要调用的端点。

        Returns:
            链中下一个可调用对象或端点的响应。
        """
        language = resolve_language(request.headers.get("accept-language"), languages)

        if language and i18n.current_language != language:
            i18n.current_language = cast(LANGUAGE_TYPE, language)

        response = await callback(request)
        return response
