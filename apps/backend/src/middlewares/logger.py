"""
Author  : Coke
Date    : 2025-05-07
"""

import logging
import time
from typing import Awaitable, Callable

from fastapi import Request, Response
from fastapi.datastructures import Address
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


def get_client_addr(client: Address | None) -> str:
    """
    Get the client address.
    Args:
        client(Address | None): Starlette client address.
    """
    if not client:
        return ""
    return "%s:%d" % client


class LoggerMiddleware(BaseHTTPMiddleware):
    """logger middleware"""

    async def dispatch(self, request: Request, callback: Callable[[Request], Awaitable[Response]]) -> Response:
        """Middleware dispatch method that logs HTTP request details and response metrics.

        This async method intercepts requests, measures execution time, and logs
        comprehensive information about the request and response.

        Args:
            request (Request): The incoming HTTP request object containing method,
                URL, client information, and other request metadata.
            callback (Callable[[Request], Awaitable[Response]]): An async callable
                that processes the request and returns a Response object.

        Returns:
            Response: The HTTP response object returned by the callback function.
        """
        before = time.time()
        response = await callback(request)

        duration = round((time.time() - before) * 1000)
        logger.info(
            '%s - "%s %s HTTP/%s" %d %dms',
            get_client_addr(request.client),
            request.method,
            request.url.path,
            request.scope.get("http_version"),
            response.status_code,
            duration,
        )

        return response
