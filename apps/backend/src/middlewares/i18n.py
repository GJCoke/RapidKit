from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.core.config import settings
from src.core.context import current_language
from src.locales.types import languages
from src.locales.utils import resolve_language


class I18nMiddleware(BaseHTTPMiddleware):
    """i18n middleware"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Dispatches the request to the next middleware or endpoint in the chain, setting and resetting
        the current language based on the incoming request's headers or query parameters.

        Args:
            request: The incoming HTTP request.
            call_next: The next callable in the middleware chain or the endpoint to be called.

        Returns:
            The response from the next callable in the chain or the endpoint.
        """
        language = (
            request.headers.get("accept-language") or request.query_params.get("lang") or settings.DEFAULT_LANGUAGE
        )
        token = current_language.set(resolve_language(language, languages, settings.DEFAULT_LANGUAGE))
        try:
            response = await call_next(request)
        finally:
            current_language.reset(token)

        return response
