from typing import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.locales.i18n import i18n
from src.locales.types import languages
from src.locales.utils import resolve_language


class I18nMiddleware(BaseHTTPMiddleware):
    """i18n middleware"""

    async def dispatch(self, request: Request, callback: Callable[[Request], Awaitable[Response]]) -> Response:
        """
        Dispatches the request to the next middleware or endpoint in the chain, setting and resetting
        the current language based on the incoming request's headers or query parameters.

        Args:
            request: The incoming HTTP request.
            callback: The next callable in the middleware chain or the endpoint to be called.

        Returns:
            The response from the next callable in the chain or the endpoint.
        """
        language = resolve_language(request.headers.get("accept-language"), languages)

        if language and i18n.current_language != language:
            i18n.current_language = language

        response = await callback(request)
        return response
