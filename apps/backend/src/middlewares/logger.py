"""
HTTP 请求日志中间件。

Author  : Coke
Date    : 2025-05-07
"""

import time
from typing import Awaitable, Callable

from fastapi import Request, Response
from fastapi.datastructures import Address
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette_context import context


def get_client_addr(client: Address | None) -> str:
    """获取客户端地址。"""
    if not client:
        return "-"
    return "%s:%d" % client


def _get_user_id(request: Request) -> str:
    """从请求上下文中提取 user_id（如果可用）。"""

    if context.exists():
        user_id = context.get("user_id")
        if user_id:
            return str(user_id)

    return "-"


class LoggerMiddleware(BaseHTTPMiddleware):
    """HTTP 请求日志中间件。"""

    async def dispatch(self, request: Request, callback: Callable[[Request], Awaitable[Response]]) -> Response:
        before = time.time()
        response = await callback(request)
        duration = round((time.time() - before) * 1000)

        client = get_client_addr(request.client)
        user = _get_user_id(request)
        method = request.method
        path = str(request.url.path)
        if request.url.query:
            path = f"{path}?{request.url.query}"

        logger.info(
            '{client} {user} "{method} {path}" {status} {duration}ms',
            client=client,
            user=user,
            method=method,
            path=path,
            status=response.status_code,
            duration=duration,
        )

        if duration > settings.SLOW_REQUEST_THRESHOLD_MS:
            logger.warning(
                'Slow request: "{method} {path}" took {duration}ms',
                method=method,
                path=path,
                duration=duration,
            )

        return response
