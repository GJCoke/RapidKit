from typing import Awaitable, Callable

from fastapi import Request, Response
from rapidkit_common.request import get_client_ip, parse_user_agent
from rapidkit_core.context import ctx
from rapidkit_core.log import logger
from starlette.middleware.base import BaseHTTPMiddleware


class StateMiddleware(BaseHTTPMiddleware):
    """客户端信息状态中间件"""

    async def dispatch(self, request: Request, callback: Callable[[Request], Awaitable[Response]]) -> Response:
        """
        调度中间件，用客户端信息充实请求上下文。
        该中间件从请求中提取并存储客户端IP地址和User-Agent详情
        （User-Agent字符串、操作系统、浏览器和设备信息）到请求上下文中，
        然后将请求传递给下一个处理程序。
        Args:
            request: 传入的HTTP请求对象。
            callback: 要调用的下一个中间件或路由处理程序。
        Returns:
            Response: 回调处理程序返回的HTTP响应。
        Notes:
            如果无法从请求中确定客户端IP或User-Agent信息，
            将记录相应的信息级别日志消息，而不是抛出异常。
        """

        ip_info = get_client_ip(request)
        if ip_info:
            ctx.ip = ip_info
        else:
            logger.info("No client IP could be determined from the request.")

        ua_info = parse_user_agent(request)
        if ua_info:
            ctx.user_agent = ua_info.user_agent
            ctx.os = ua_info.os
            ctx.browser = ua_info.browser
            ctx.device = ua_info.device
        else:
            logger.info("No User-Agent header found in the request.")

        response = await callback(request)
        return response
