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
    获取客户端地址。
    Args:
        client: Starlette 客户端地址。
    """
    if not client:
        return ""
    return "%s:%d" % client


class LoggerMiddleware(BaseHTTPMiddleware):
    """日志中间件"""

    async def dispatch(self, request: Request, callback: Callable[[Request], Awaitable[Response]]) -> Response:
        """中间件分发方法，记录 HTTP 请求详情和响应指标。

        这个异步方法拦截请求，测量执行时间，并记录关于请求和响应的
        完整信息。

        Args:
            request: 包含方法、URL、客户端信息和其他请求元数据的
                传入 HTTP 请求对象。
            callback: 处理请求并
                返回 Response 对象的异步可调用对象。

        Returns:
            Response: 回调函数返回的 HTTP 响应对象。
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
